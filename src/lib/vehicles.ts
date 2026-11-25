import type { CalendarEvent, ClientDebt, Fine, FleetState, Rental, Vehicle, VehicleSnapshot } from '../types'

export function vehicleLabel(vehicle?: Vehicle, snapshot?: VehicleSnapshot) {
  if (!vehicle) return snapshot?.label || 'Vehículo eliminado'
  return `${vehicle.brand} ${vehicle.model}`.trim() || vehicle.category || vehicle.plate
}

export function vehiclePlate(vehicle?: Vehicle, snapshot?: VehicleSnapshot) {
  return vehicle?.plate ?? snapshot?.plate ?? ''
}

export const isRetired = (vehicle?: Vehicle) => vehicle?.estado === 'baja'

// Vehicles for day-to-day use: fleet list, KPIs, availability and selectors for new records.
export const activeVehicles = (state: Pick<FleetState, 'vehicles'>) => state.vehicles.filter(vehicle => !isRetired(vehicle))
export const retiredVehicles = (state: Pick<FleetState, 'vehicles'>) => state.vehicles.filter(isRetired)

// Selector options: active vehicles plus the one already linked to the record being edited,
// so editing an old record never loses its vehicle.
export function vehicleOptions(state: Pick<FleetState, 'vehicles'>, currentId?: string) {
  return state.vehicles.filter(vehicle => !isRetired(vehicle) || vehicle.id === currentId)
}

export const vehicleOptionLabel = (vehicle: Vehicle) => isRetired(vehicle) ? ' (de baja)' : ''

type SnapshotHolder = Pick<Rental, 'vehicleId' | 'vehicleSnapshot'> | Pick<Fine, 'vehicleId' | 'vehicleSnapshot'> | Pick<ClientDebt, 'vehicleId' | 'vehicleSnapshot'> | Pick<CalendarEvent, 'vehicleId' | 'vehicleSnapshot'>

// Every vehicle the history can mention: current vehicles plus snapshots of deleted ones.
export function vehicleSnapshots(state: Pick<FleetState, 'rentals' | 'fines' | 'debts'> & Partial<Pick<FleetState, 'events'>>) {
  const snapshots = new Map<string, VehicleSnapshot>()
  const holders: SnapshotHolder[] = [...state.rentals, ...state.fines, ...(state.debts || []), ...(state.events || [])]
  for (const item of holders) if (item.vehicleId && item.vehicleSnapshot && !snapshots.has(item.vehicleId)) snapshots.set(item.vehicleId, item.vehicleSnapshot)
  return snapshots
}

export function snapshotVehicle(vehicle: Vehicle, now = new Date()): VehicleSnapshot {
  return { plate: vehicle.plate, brand: vehicle.brand, model: vehicle.model, label: vehicleLabel(vehicle), deletedAt: now.toISOString() }
}
