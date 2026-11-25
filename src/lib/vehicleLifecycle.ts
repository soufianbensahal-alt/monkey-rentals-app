import type { FleetState, Rental, Vehicle, VehicleRetirement, VehicleRetirementReason, VehicleStateChange } from '../types'
import { uid } from './format'
import { isRetired, snapshotVehicle } from './vehicles'

export const retirementReasons: Record<VehicleRetirementReason, string> = {
  venta: 'Venta',
  siniestro_total: 'Siniestro total',
  robo: 'Robo',
  fin_renting: 'Fin de renting',
  desguace: 'Desguace',
  traspaso: 'Traspaso',
  otro: 'Otro',
}

export type RetirementInput = Omit<VehicleRetirement, 'registradaPor' | 'registradaAt'>

// Drops undefined keys so the object matches its JSON form (the sync merge compares keys).
const compact = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T

const localToday = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

// Open rentals: in progress or still to start. Both have to be closed or reassigned first.
export function retirementBlockers(state: Pick<FleetState, 'rentals'>, vehicleId: string): Rental[] {
  return state.rentals
    .filter(rental => rental.vehicleId === vehicleId && (rental.status === 'activo' || rental.status === 'pendiente'))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export function validateRetirement(input: RetirementInput, now = new Date()): string | undefined {
  if (!Object.hasOwn(retirementReasons, input.motivo)) return 'Selecciona el motivo de la baja.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return 'Indica la fecha de baja.'
  if (input.fecha > localToday(now)) return 'La fecha de baja no puede ser posterior a hoy.'
  if (input.motivo === 'otro' && !input.notas.trim()) return 'Explica el motivo en las notas cuando eliges «Otro».'
  if (input.precioVenta !== undefined && (!Number.isFinite(input.precioVenta) || input.precioVenta < 0)) return 'El precio de venta debe ser un importe válido.'
}

// Extra fields only apply to their own reason, like the expense categories.
function normalizeRetirement(input: RetirementInput): RetirementInput {
  const sale = input.motivo === 'venta', claim = input.motivo === 'siniestro_total'
  return compact({
    motivo: input.motivo,
    fecha: input.fecha,
    notas: input.notas.trim(),
    precioVenta: sale ? input.precioVenta : undefined,
    comprador: sale ? input.comprador?.trim() || undefined : undefined,
    numeroSiniestro: claim ? input.numeroSiniestro?.trim() || undefined : undefined,
    aseguradora: claim ? input.aseguradora?.trim() || undefined : undefined,
  })
}

export function retireVehicle(state: Pick<FleetState, 'rentals'>, vehicle: Vehicle, input: RetirementInput, userId?: string | null, now = new Date()): Vehicle {
  if (isRetired(vehicle)) throw new Error('Este vehículo ya está dado de baja.')
  if (retirementBlockers(state, vehicle.id).length) throw new Error('Cierra o reasigna los alquileres en curso y las reservas futuras antes de dar de baja el vehículo.')
  const problem = validateRetirement(input, now)
  if (problem) throw new Error(problem)
  const baja: VehicleRetirement = compact({ ...normalizeRetirement(input), registradaPor: userId || undefined, registradaAt: now.toISOString() })
  const change: VehicleStateChange = compact({ id: uid('vs'), estadoAnterior: 'activo' as const, estadoNuevo: 'baja' as const, motivo: baja.motivo, fechaBaja: baja.fecha, notas: baja.notas, usuario: userId || undefined, fecha: baja.registradaAt })
  return { ...vehicle, estado: 'baja', baja, estadoHistorial: [...(vehicle.estadoHistorial || []), change] }
}

export function reactivateVehicle(vehicle: Vehicle, notas = '', userId?: string | null, now = new Date()): Vehicle {
  if (!isRetired(vehicle)) throw new Error('Este vehículo ya está activo.')
  const change: VehicleStateChange = compact({ id: uid('vs'), estadoAnterior: 'baja' as const, estadoNuevo: 'activo' as const, motivo: vehicle.baja?.motivo, notas: notas.trim(), usuario: userId || undefined, fecha: now.toISOString() })
  const next: Vehicle = { ...vehicle, estado: 'activo', estadoHistorial: [...(vehicle.estadoHistorial || []), change] }
  delete next.baja
  return next
}

export interface VehicleDeletionPlan {
  removed: { maintenance: string[]; documents: string[]; taxes: string[]; events: string[]; fines: string[] }
  kept: { rentals: string[]; payments: string[]; fines: string[]; debts: string[]; events: string[] }
}

// What a hard delete removes and what it keeps. Rentals, their payments, fines and reminders
// linked to a kept rental, client debts and expenses survive with a snapshot of the vehicle.
// Reminders go away only when they depend on the vehicle alone, or on a maintenance or
// document that is deleted with it.
export function vehicleDeletionPlan(state: FleetState, vehicleId: string): VehicleDeletionPlan {
  const rentals = state.rentals.filter(rental => rental.vehicleId === vehicleId).map(rental => rental.id)
  const allRentalIds = new Set(state.rentals.map(rental => rental.id))
  const fines = state.fines.filter(fine => fine.vehicleId === vehicleId)
  const keptFine = (fine: FleetState['fines'][number]) => !!fine.rentalId && allRentalIds.has(fine.rentalId)
  const rentalIds = new Set(rentals)
  const maintenance = state.maintenance.filter(item => item.vehicleId === vehicleId).map(item => item.id)
  const documents = state.documents.filter(item => item.vehicleId === vehicleId).map(item => item.id)
  const removedLinks = new Set([...maintenance, ...documents])
  const keptEvent = (event: FleetState['events'][number]) => !!event.rentalId && allRentalIds.has(event.rentalId)
  const affectedEvents = state.events.filter(item => item.vehicleId === vehicleId || removedLinks.has(item.maintenanceId || '') || removedLinks.has(item.documentId || ''))
  return {
    removed: {
      maintenance,
      documents,
      taxes: state.taxes.filter(item => item.vehicleId === vehicleId).map(item => item.id),
      events: affectedEvents.filter(event => !keptEvent(event)).map(event => event.id),
      fines: fines.filter(fine => !keptFine(fine)).map(fine => fine.id),
    },
    kept: {
      rentals,
      payments: state.payments.filter(payment => rentalIds.has(payment.rentalId)).map(payment => payment.id),
      fines: fines.filter(keptFine).map(fine => fine.id),
      debts: (state.debts || []).filter(debt => debt.vehicleId === vehicleId).map(debt => debt.id),
      events: affectedEvents.filter(keptEvent).map(event => event.id),
    },
  }
}

export function removeVehicleSelective(state: FleetState, vehicleId: string, now = new Date()): FleetState {
  const vehicle = state.vehicles.find(item => item.id === vehicleId)
  if (!vehicle) return state
  const snapshot = snapshotVehicle(vehicle, now)
  const plan = vehicleDeletionPlan(state, vehicleId)
  const drop = (ids: string[]) => { const set = new Set(ids); return <T extends { id: string }>(item: T) => !set.has(item.id) }
  const keptFines = new Set(plan.kept.fines)
  const removedLinks = new Set([...plan.removed.maintenance, ...plan.removed.documents])
  // Kept reminders store the vehicle snapshot and drop links to records deleted here.
  const keepEvent = (event: FleetState['events'][number]) => {
    const next = { ...event, ...(event.vehicleId === vehicleId ? { vehicleSnapshot: snapshot } : {}) }
    if (removedLinks.has(next.maintenanceId || '')) delete next.maintenanceId
    if (removedLinks.has(next.documentId || '')) delete next.documentId
    return next
  }
  const keptEvents = new Set(plan.kept.events)
  return {
    ...state,
    vehicles: state.vehicles.filter(item => item.id !== vehicleId),
    rentals: state.rentals.map(rental => rental.vehicleId === vehicleId ? { ...rental, vehicleSnapshot: snapshot } : rental),
    fines: state.fines.filter(drop(plan.removed.fines)).map(fine => keptFines.has(fine.id) ? { ...fine, vehicleSnapshot: snapshot } : fine),
    debts: state.debts?.map(debt => debt.vehicleId === vehicleId ? { ...debt, vehicleSnapshot: snapshot } : debt),
    maintenance: state.maintenance.filter(drop(plan.removed.maintenance)),
    documents: state.documents.filter(drop(plan.removed.documents)),
    taxes: state.taxes.filter(drop(plan.removed.taxes)),
    events: state.events.filter(drop(plan.removed.events)).map(event => keptEvents.has(event.id) ? keepEvent(event) : event),
  }
}
