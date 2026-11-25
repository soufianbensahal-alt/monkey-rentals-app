import { describe, expect, it } from 'vitest'
import type { CellObject } from 'write-excel-file/browser'
import { emptyState } from '../data/emptyState'
import type { FleetState, Vehicle } from '../types'
import { getSystemAlerts } from './alerts'
import { createBackup, parseBackup } from './backups'
import { fromRow, toRow, type Expense } from './expenses'
import { buildReportWorkbook } from './reportWorkbook'
import { reactivateVehicle, removeVehicleSelective, retireVehicle, retirementBlockers, validateRetirement, vehicleDeletionPlan } from './vehicleLifecycle'
import { activeVehicles, retiredVehicles, snapshotVehicle, vehicleLabel, vehicleOptions, vehiclePlate, vehicleSnapshots } from './vehicles'

const now = new Date('2026-11-25T10:00:00.000Z')
const vehicle = (id: string, patch: Partial<Vehicle> = {}): Vehicle => ({ id, plate: `${id.toUpperCase()}123`, brand: 'Ford', model: 'Transit', category: 'Furgoneta', year: 2022, dailyRate: 40, weeklyRate: 250, monthlyRate: 700, includedKmPerDay: 125, extraKmRate: 0.15, status: 'disponible', notes: '', ...patch })

function fixture(): FleetState {
  const state = structuredClone(emptyState)
  state.vehicles = [vehicle('v1', { currentKm: 50000 }), vehicle('v2', { brand: 'Renault', model: 'Kangoo' })]
  state.customers = [{ id: 'c1', name: 'Ana', email: '', phone: '', dni: '', rentals: 1 }]
  state.rentals = [
    { id: 'r1', vehicleId: 'v1', customerId: 'c1', startDate: '2026-08-01', endDate: '2026-08-31', agreedPrice: 600, pricePeriod: 'mes', expectedKilometers: 0, status: 'finalizado', notes: '' },
    { id: 'r2', vehicleId: 'v2', customerId: 'c1', startDate: '2026-09-01', agreedPrice: 500, pricePeriod: 'mes', expectedKilometers: 0, status: 'activo', notes: '' },
  ]
  state.payments = [
    { id: 'p1', rentalId: 'r1', dueDate: '2026-08-01', paidDate: '2026-08-01', amount: 600, status: 'pagado', notes: '' },
    { id: 'p2', rentalId: 'r2', dueDate: '2026-09-01', amount: 500, status: 'pendiente', notes: '' },
  ]
  state.maintenance = [{ id: 'm1', vehicleId: 'v1', date: '2026-08-10', type: 'Revisión', cost: 100, status: 'completado', notes: '' }, { id: 'm2', vehicleId: 'v2', date: '2026-08-10', type: 'Revisión', cost: 80, status: 'completado', notes: '' }]
  state.documents = [{ id: 'd1', vehicleId: 'v1', type: 'ITV', expiryDate: '2026-12-01', notes: '' }, { id: 'd2', vehicleId: 'v2', type: 'ITV', expiryDate: '2026-12-01', notes: '' }]
  state.taxes = [{ id: 't1', vehicleId: 'v1', concept: 'IVTM', dueDate: '2026-12-10', amount: 60, status: 'pendiente', notes: '' }]
  state.fines = [
    { id: 'f-rental', vehicleId: 'v1', customerId: 'c1', rentalId: 'r1', infractionDate: '2026-08-05', amount: 30, status: 'cargada al cliente', concept: 'Aparcamiento', notes: '' },
    { id: 'f-loose', vehicleId: 'v1', infractionDate: '2026-10-05', amount: 90, status: 'pendiente', concept: 'Velocidad', notes: '' },
    { id: 'f-other', vehicleId: 'v2', infractionDate: '2026-10-05', amount: 90, status: 'pendiente', concept: 'Velocidad', notes: '' },
  ]
  state.events = [
    { id: 'e-vehicle', title: 'Seguro', date: '2026-12-01', type: 'otro', vehicleId: 'v1' },
    { id: 'e-doc', title: 'Pasar ITV', date: '2026-12-01', type: 'itv', documentId: 'd1' },
    { id: 'e-customer', title: 'Llamar', date: '2026-12-01', type: 'otro', customerId: 'c1' },
    { id: 'e-rental', title: 'Cobrar daños', date: '2026-12-01', type: 'pago', rentalId: 'r1', customerId: 'c1', vehicleId: 'v1', documentId: 'd1' },
    { id: 'e-rental-maint', title: 'Revisar factura', date: '2026-12-01', type: 'otro', rentalId: 'r1', maintenanceId: 'm1' },
    { id: 'e-gone-rental', title: 'Alquiler borrado', date: '2026-12-01', type: 'otro', rentalId: 'r-borrado', vehicleId: 'v1' },
  ]
  state.debts = [{ id: 'debt1', customerId: 'c1', customerName: 'Ana', originalAmount: 50, date: '2026-08-31', reason: 'Limpieza', rentalId: 'r1', vehicleId: 'v1', notes: '', createdAt: '', updatedAt: '' }]
  return state
}

describe('Snapshot de vehículo', () => {
  it('guarda matrícula, marca, modelo y etiqueta fijas', () => {
    expect(snapshotVehicle(vehicle('v1'), now)).toEqual({ plate: 'V1123', brand: 'Ford', model: 'Transit', label: 'Ford Transit', deletedAt: now.toISOString() })
  })

  it('las vistas usan el snapshot cuando el vehículo ya no existe', () => {
    const snapshot = snapshotVehicle(vehicle('v1'), now)
    expect(vehicleLabel(undefined, snapshot)).toBe('Ford Transit')
    expect(vehiclePlate(undefined, snapshot)).toBe('V1123')
    expect(vehicleLabel(undefined)).toBe('Vehículo eliminado')
    expect(vehicleLabel(vehicle('v9', { brand: 'Seat', model: 'Ibiza' }), snapshot)).toBe('Seat Ibiza')
  })

  it('los gastos envían el snapshot solo si existe y permiten borrarlo con null', () => {
    const base: Expense = { id: 'x', date: '2026-10-01', amount: 10, category: 'material', description: '', vehicleId: 'v1', createdAt: '2026-10-01T00:00:00Z' }
    expect(toRow(base, 'u')).not.toHaveProperty('vehicle_snapshot')
    const snapshot = snapshotVehicle(vehicle('v1'), now)
    const row = toRow({ ...base, vehicleSnapshot: snapshot }, 'u')
    expect(row.vehicle_snapshot).toEqual(snapshot)
    expect(fromRow({ ...row, created_at: base.createdAt }).vehicleSnapshot).toEqual(snapshot)
    expect(toRow({ ...base, vehicleSnapshot: null }, 'u').vehicle_snapshot).toBeNull()
  })
})

describe('Eliminación selectiva de vehículos', () => {
  it('planifica qué se borra y qué se conserva', () => {
    expect(vehicleDeletionPlan(fixture(), 'v1')).toEqual({
      removed: { maintenance: ['m1'], documents: ['d1'], taxes: ['t1'], events: ['e-vehicle', 'e-doc', 'e-gone-rental'], fines: ['f-loose'] },
      kept: { rentals: ['r1'], payments: ['p1'], fines: ['f-rental'], debts: ['debt1'], events: ['e-rental', 'e-rental-maint'] },
    })
  })

  it('conserva alquileres, pagos, clientes, multas de alquiler y deudas con snapshot y borra el resto', () => {
    const before = fixture()
    const after = removeVehicleSelective(before, 'v1', now)
    const snapshot = snapshotVehicle(before.vehicles[0], now)
    expect(after.vehicles.map(v => v.id)).toEqual(['v2'])
    expect(after.customers).toEqual(before.customers)
    expect(after.rentals.find(r => r.id === 'r1')).toEqual({ ...before.rentals[0], vehicleSnapshot: snapshot })
    expect(after.rentals.find(r => r.id === 'r2')).toEqual(before.rentals[1])
    expect(after.payments).toEqual(before.payments)
    expect(after.fines.map(f => f.id)).toEqual(['f-rental', 'f-other'])
    expect(after.fines[0].vehicleSnapshot).toEqual(snapshot)
    expect(after.debts?.[0].vehicleSnapshot).toEqual(snapshot)
    expect(after.maintenance.map(m => m.id)).toEqual(['m2'])
    expect(after.documents.map(d => d.id)).toEqual(['d2'])
    expect(after.taxes).toEqual([])
    expect(after.events.map(e => e.id)).toEqual(['e-customer', 'e-rental', 'e-rental-maint'])
    // Rental-linked reminders keep the vehicle snapshot and drop links to deleted records.
    const rentalReminder = { ...before.events[3], vehicleSnapshot: snapshot }
    delete rentalReminder.documentId
    expect(after.events[1]).toEqual(rentalReminder)
    expect(after.events[2]).not.toHaveProperty('maintenanceId')
    expect(after.events[2]).not.toHaveProperty('vehicleSnapshot')
    expect(after.events[0]).toBe(before.events[2])
  })

  it('no hace nada si el vehículo no existe', () => {
    const state = fixture()
    expect(removeVehicleSelective(state, 'nope', now)).toBe(state)
  })

  it('informes y copias de seguridad siguen mostrando el vehículo eliminado', () => {
    const after = removeVehicleSelective(fixture(), 'v1', now)
    expect(vehicleSnapshots(after).get('v1')?.plate).toBe('V1123')
    const rentals = buildReportWorkbook(after, '2026-11-25', 'owner@example.test').find(s => s.sheet === 'Alquileres')!
    const r1 = rentals.data.map(row => row.map(cell => (cell as CellObject)?.value)).find(row => row.includes('V1123'))
    expect(r1).toContain('Ford Transit')
    const backup = createBackup(after, 'owner', now)
    expect(parseBackup(JSON.stringify(backup), 'owner').data.rentals[0].vehicleSnapshot?.label).toBe('Ford Transit')
  })
})

describe('Baja lógica de vehículos', () => {
  it('bloquea la baja con alquileres en curso o reservas futuras', () => {
    const state = fixture()
    state.rentals.push({ id: 'r3', vehicleId: 'v1', customerId: 'c1', startDate: '2027-01-01', agreedPrice: 100, pricePeriod: 'dia', expectedKilometers: 0, status: 'pendiente', notes: '' })
    expect(retirementBlockers(state, 'v1').map(r => r.id)).toEqual(['r3'])
    expect(retirementBlockers(state, 'v2').map(r => r.id)).toEqual(['r2'])
    expect(() => retireVehicle(state, state.vehicles[1], { motivo: 'venta', fecha: '2026-11-25', notas: '' }, 'user', now)).toThrow(/alquileres/)
  })

  it('valida motivo, fecha y notas obligatorias para «Otro»', () => {
    expect(validateRetirement({ motivo: 'otro', fecha: '2026-11-25', notas: ' ' }, now)).toMatch(/notas/)
    expect(validateRetirement({ motivo: 'venta', fecha: '2026-11-26', notas: '' }, now)).toMatch(/posterior/)
    expect(validateRetirement({ motivo: 'venta', fecha: '', notas: '' }, now)).toMatch(/fecha/)
    expect(validateRetirement({ motivo: 'robo', fecha: '2026-11-20', notas: '' }, now)).toBeUndefined()
  })

  it('da de baja, oculta del uso diario, conserva el historial y se puede reactivar', () => {
    const state = fixture()
    const retired = retireVehicle(state, state.vehicles[0], { motivo: 'venta', fecha: '2026-11-20', notas: ' Vendida ', precioVenta: 9000, comprador: 'Taller Sur', numeroSiniestro: 'ignorado' }, 'user-1', now)
    expect(retired).toMatchObject({ estado: 'baja', baja: { motivo: 'venta', fecha: '2026-11-20', notas: 'Vendida', precioVenta: 9000, comprador: 'Taller Sur', registradaPor: 'user-1', registradaAt: now.toISOString() } })
    expect(retired.baja).not.toHaveProperty('numeroSiniestro')
    expect(retired.estadoHistorial).toHaveLength(1)
    expect(retired.estadoHistorial?.[0]).toMatchObject({ estadoAnterior: 'activo', estadoNuevo: 'baja', motivo: 'venta', usuario: 'user-1' })

    const next = { ...state, vehicles: [retired, state.vehicles[1]] }
    expect(activeVehicles(next).map(v => v.id)).toEqual(['v2'])
    expect(retiredVehicles(next).map(v => v.id)).toEqual(['v1'])
    expect(vehicleOptions(next).map(v => v.id)).toEqual(['v2'])
    expect(vehicleOptions(next, 'v1').map(v => v.id)).toEqual(['v1', 'v2'])
    expect(next.rentals).toEqual(state.rentals)
    expect(getSystemAlerts(next).some(alert => alert.id === 'document-d1' || alert.id === 'tax-t1')).toBe(false)
    expect(getSystemAlerts(next).some(alert => alert.id === 'document-d2')).toBe(true)
    expect(parseBackup(JSON.stringify(createBackup(next, 'owner', now)), 'owner').data.vehicles[0].estado).toBe('baja')

    const reactivated = reactivateVehicle(retired, 'Recomprada', 'user-1', new Date('2026-11-26T10:00:00.000Z'))
    expect(reactivated.estado).toBe('activo')
    expect(reactivated).not.toHaveProperty('baja')
    expect(reactivated.estadoHistorial?.map(change => change.estadoNuevo)).toEqual(['baja', 'activo'])
    expect(reactivated.estadoHistorial?.[1]).toMatchObject({ estadoAnterior: 'baja', motivo: 'venta', notas: 'Recomprada' })
    expect(() => reactivateVehicle(reactivated)).toThrow(/activo/)
  })
})
