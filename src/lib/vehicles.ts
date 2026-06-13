import type { Vehicle } from '../types'

export function vehicleLabel(vehicle?: Vehicle) {
  if (!vehicle) return 'Vehículo eliminado'
  return `${vehicle.brand} ${vehicle.model}`.trim() || vehicle.category || vehicle.plate
}
