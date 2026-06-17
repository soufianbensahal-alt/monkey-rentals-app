import { describe, expect, it } from 'vitest'
import { calculateIncludedKm, calculateRecommendedRentalPrice, inferRentalDays, suggestRentalEndDate } from './rentalPricing'
import type { Vehicle } from '../types'

const vehicle: Vehicle = {
  id: 'v1',
  plate: '1234ABC',
  category: 'Coche utilitario',
  brand: 'Fiat',
  model: 'Panda',
  year: 2026,
  dailyRate: 20,
  weeklyRate: 126,
  monthlyRate: 600,
  includedKmPerDay: 125,
  extraKmRate: 0.15,
  status: 'disponible',
  notes: '',
}

describe('rentalPricing', () => {
  it('calcula el precio por dias usando tarifa diaria y numero de dias', () => {
    expect(calculateRecommendedRentalPrice(vehicle, 'dia', 5)).toBe(100)
  })

  it('usa las tarifas semanales y mensuales del vehiculo', () => {
    expect(calculateRecommendedRentalPrice(vehicle, 'semana')).toBe(126)
    expect(calculateRecommendedRentalPrice(vehicle, 'mes')).toBe(600)
  })

  it('rechaza dias invalidos y tarifas no configuradas', () => {
    expect(calculateRecommendedRentalPrice(vehicle, 'dia', 0)).toBeNull()
    expect(calculateRecommendedRentalPrice({ ...vehicle, weeklyRate: 0 }, 'semana')).toBeNull()
  })

  it('sugiere fecha final e informa kilometros incluidos para alquileres por dias', () => {
    expect(suggestRentalEndDate('2026-06-17', 3)).toBe('2026-06-20')
    expect(inferRentalDays('2026-06-17', '2026-06-20')).toBe(3)
    expect(calculateIncludedKm(vehicle, 'dia', 3)).toBe(375)
  })
})
