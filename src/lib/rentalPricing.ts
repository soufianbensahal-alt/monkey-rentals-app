import type { PricePeriod, Vehicle } from '../types'

export type RentalBillingPeriod = Exclude<PricePeriod, 'otro'>

const DAY_MS = 24 * 60 * 60 * 1000

export function normalizeBillingPeriod(period: PricePeriod): RentalBillingPeriod {
  return period === 'dia' || period === 'semana' || period === 'mes' ? period : 'mes'
}

export function getRentalRate(vehicle: Vehicle | undefined, period: RentalBillingPeriod): number | null {
  if (!vehicle) return null
  const rate = period === 'dia' ? vehicle.dailyRate : period === 'semana' ? vehicle.weeklyRate : vehicle.monthlyRate
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

export function calculateRecommendedRentalPrice(vehicle: Vehicle | undefined, period: RentalBillingPeriod, days = 1): number | null {
  const rate = getRentalRate(vehicle, period)
  if (rate === null) return null
  if (period !== 'dia') return roundMoney(rate)
  if (!Number.isFinite(days) || days <= 0) return null
  return roundMoney(rate * days)
}

export function calculateIncludedKm(vehicle: Vehicle | undefined, period: RentalBillingPeriod, days: number): number | null {
  if (!vehicle || period !== 'dia' || !Number.isFinite(days) || days <= 0 || vehicle.includedKmPerDay <= 0) return null
  return vehicle.includedKmPerDay * days
}

export function suggestRentalEndDate(startDate: string, days: number): string {
  if (!startDate || !Number.isFinite(days) || days <= 0) return ''
  const start = parseDate(startDate)
  if (!start) return ''
  const end = new Date(start.getTime() + days * DAY_MS)
  return toDateInputValue(end)
}

export function inferRentalDays(startDate?: string, endDate?: string): number | null {
  if (!startDate || !endDate) return null
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  if (!start || !end) return null
  const diff = Math.round((end.getTime() - start.getTime()) / DAY_MS)
  return diff > 0 ? diff : null
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(Date.UTC(year, month - 1, day))
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}
