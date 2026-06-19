import type { Customer, FleetState, MaintenanceRecord, Rental, Vehicle, VehicleStatus } from '../types'
import { date, euro } from './format'

export type VehicleStatusTone = 'success' | 'info' | 'warning' | 'danger'

export interface CalculatedVehicleStatus {
  status: VehicleStatus
  label: string
  tone: VehicleStatusTone
  detail: string
  rental?: Rental
  customer?: Customer
  maintenance?: MaintenanceRecord
}

const labels: Record<VehicleStatus, string> = {
  disponible: 'Disponible',
  alquilado: 'Alquilado',
  reservado: 'Reservado',
  mantenimiento: 'En mantenimiento',
}

const tones: Record<VehicleStatus, VehicleStatusTone> = {
  disponible: 'success',
  alquilado: 'warning',
  reservado: 'info',
  mantenimiento: 'danger',
}

function todayIso(today = new Date()) {
  return today.toISOString().slice(0, 10)
}

function isCurrentRental(rental: Rental, today: string) {
  return rental.status === 'activo' && rental.startDate <= today && (!rental.endDate || rental.endDate >= today)
}

function isFutureReservation(rental: Rental, today: string) {
  return (rental.status === 'pendiente' || rental.status === 'activo') && rental.startDate > today
}

function isActiveMaintenance(record: MaintenanceRecord) {
  return record.status === 'programado' || record.status === 'en curso'
}

function maintenancePriority(status: MaintenanceRecord['status']) {
  if (status === 'en curso') return 0
  if (status === 'programado') return 1
  return 2
}

export function getVehicleCalculatedStatus(vehicle: Vehicle, state: FleetState, today = todayIso()): CalculatedVehicleStatus {
  const maintenance = state.maintenance
    .filter(record => record.vehicleId === vehicle.id && isActiveMaintenance(record))
    .sort((a, b) => maintenancePriority(a.status) - maintenancePriority(b.status) || a.date.localeCompare(b.date))[0]

  if (maintenance) {
    return {
      status: 'mantenimiento',
      label: labels.mantenimiento,
      tone: tones.mantenimiento,
      detail: `${maintenance.type}${maintenance.date ? ` · desde ${date(maintenance.date)}` : ''}${maintenance.cost ? ` · ${euro.format(maintenance.cost)}` : ''}`,
      maintenance,
    }
  }

  const activeRental = state.rentals
    .filter(rental => rental.vehicleId === vehicle.id && isCurrentRental(rental, today))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

  if (activeRental) {
    const customer = state.customers.find(item => item.id === activeRental.customerId)
    return {
      status: 'alquilado',
      label: labels.alquilado,
      tone: tones.alquilado,
      detail: `${customer?.name || 'Cliente'} · ${date(activeRental.startDate)}${activeRental.endDate ? ` - ${date(activeRental.endDate)}` : ' - sin fecha final'} · ${euro.format(activeRental.agreedPrice)}`,
      rental: activeRental,
      customer,
    }
  }

  const reservation = state.rentals
    .filter(rental => rental.vehicleId === vehicle.id && isFutureReservation(rental, today))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

  if (reservation) {
    const customer = state.customers.find(item => item.id === reservation.customerId)
    return {
      status: 'reservado',
      label: labels.reservado,
      tone: tones.reservado,
      detail: `${customer?.name || 'Cliente'} · desde ${date(reservation.startDate)}${reservation.endDate ? ` hasta ${date(reservation.endDate)}` : ''} · ${euro.format(reservation.agreedPrice)}`,
      rental: reservation,
      customer,
    }
  }

  return {
    status: 'disponible',
    label: labels.disponible,
    tone: tones.disponible,
    detail: 'Sin alquileres, reservas ni mantenimiento activo.',
  }
}

export function getVehicleStatusMap(state: FleetState, today = todayIso()) {
  return new Map(state.vehicles.map(vehicle => [vehicle.id, getVehicleCalculatedStatus(vehicle, state, today)]))
}
