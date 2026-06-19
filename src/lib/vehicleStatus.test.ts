import { describe, expect, it } from 'vitest'
import { emptyState } from '../data/emptyState'
import { getVehicleCalculatedStatus } from './vehicleStatus'
import type { Customer, FleetState, MaintenanceRecord, Rental, Vehicle } from '../types'

const vehicle: Vehicle = {
  id: 'v1',
  plate: '1234ABC',
  category: 'Furgoneta pequeña',
  brand: 'Fiat',
  model: 'Doblò',
  year: 2026,
  dailyRate: 36,
  weeklyRate: 169.4,
  monthlyRate: 600,
  includedKmPerDay: 125,
  extraKmRate: 0.15,
  status: 'alquilado',
  notes: '',
}

const customer: Customer = {
  id: 'c1',
  name: 'Juan Pérez',
  email: '',
  phone: '',
  dni: '',
  rentals: 1,
}

function stateWith(overrides: Partial<FleetState> = {}): FleetState {
  return {
    ...structuredClone(emptyState),
    vehicles: [vehicle],
    customers: [customer],
    ...overrides,
  }
}

function rental(overrides: Partial<Rental>): Rental {
  return {
    id: 'r1',
    vehicleId: 'v1',
    customerId: 'c1',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    agreedPrice: 600,
    pricePeriod: 'mes',
    expectedKilometers: 0,
    status: 'activo',
    notes: '',
    ...overrides,
  }
}

function maintenance(overrides: Partial<MaintenanceRecord>): MaintenanceRecord {
  return {
    id: 'm1',
    vehicleId: 'v1',
    type: 'Cambio de embrague',
    date: '2026-06-19',
    cost: 240,
    status: 'en curso',
    notes: '',
    ...overrides,
  }
}

describe('vehicleStatus', () => {
  it('ignora el estado manual antiguo del vehículo cuando no hay datos relacionados', () => {
    const calculated = getVehicleCalculatedStatus(vehicle, stateWith(), '2026-06-19')

    expect(calculated.status).toBe('disponible')
    expect(calculated.label).toBe('Disponible')
  })

  it('marca como alquilado si hoy cae dentro de un alquiler activo', () => {
    const calculated = getVehicleCalculatedStatus(vehicle, stateWith({ rentals:[rental({})] }), '2026-06-19')

    expect(calculated.status).toBe('alquilado')
    expect(calculated.detail).toContain('Juan Pérez')
    expect(calculated.detail).toContain('600')
  })

  it('marca como reservado si existe una reserva futura', () => {
    const calculated = getVehicleCalculatedStatus(vehicle, stateWith({ rentals:[rental({ startDate:'2026-06-25', endDate:'2026-06-30', status:'pendiente' })] }), '2026-06-19')

    expect(calculated.status).toBe('reservado')
    expect(calculated.detail).toContain('Juan Pérez')
  })

  it('prioriza mantenimiento activo por encima de alquileres y reservas', () => {
    const calculated = getVehicleCalculatedStatus(vehicle, stateWith({
      maintenance:[maintenance({})],
      rentals:[rental({})],
    }), '2026-06-19')

    expect(calculated.status).toBe('mantenimiento')
    expect(calculated.detail).toContain('Cambio de embrague')
  })

  it('no bloquea el vehículo con mantenimientos completados', () => {
    const calculated = getVehicleCalculatedStatus(vehicle, stateWith({
      maintenance:[maintenance({ status:'completado' })],
    }), '2026-06-19')

    expect(calculated.status).toBe('disponible')
  })
})
