import type { FleetState, Payment, Rental, RentalMileage, Vehicle } from '../types'

const round = (n: number) => Math.round(n * 100 + Number.EPSILON * Math.abs(n * 100) * 4) / 100
const valid = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n >= 0

export function calculateMileage(rental: RentalMileage, vehicle?: Vehicle) {
  const used = valid(rental.kmStart) && valid(rental.kmEnd) && rental.kmEnd >= rental.kmStart ? rental.kmEnd - rental.kmStart : undefined
  const price = rental.kmExtraPrice ?? rental.kmExtraDefaultPrice ?? vehicle?.extraKmRate
  const vatRate = rental.kmExtraVatRate ?? 21
  const extra = rental.kmExtraEnabled && used !== undefined && valid(rental.kmIncludedTotal) ? Math.max(0, used - rental.kmIncludedTotal) : undefined
  const base = extra !== undefined && valid(price) ? round(extra * price) : undefined
  const vat = base !== undefined ? Math.round(Math.round(base * 100) * vatRate / 100) / 100 : undefined
  return { used, extra, price, vatRate, base, vat, total: base !== undefined && vat !== undefined ? round(base + vat) : undefined }
}

export function validateMileage(rental: RentalMileage, vehicle?: Vehicle): string | undefined {
  for (const [name, value] of [['Km iniciales', rental.kmStart], ['Km finales', rental.kmEnd], ['Km incluidos', rental.kmIncludedTotal], ['Precio por km extra', rental.kmExtraPrice]] as const) {
    if (value !== undefined && !valid(value)) return `${name}: introduce un número válido mayor o igual que cero.`
  }
  if (rental.kmEnd !== undefined && rental.kmStart === undefined) return 'Introduce los km iniciales para calcular los kilómetros realizados.'
  if (rental.kmEnd !== undefined && rental.kmStart !== undefined && rental.kmEnd < rental.kmStart) return 'Los km finales no pueden ser inferiores a los km iniciales.'
  if (rental.kmExtraEnabled && !valid(rental.kmIncludedTotal)) return 'Indica los km incluidos antes de activar el cálculo de kilómetros extra.'
  if (rental.kmExtraEnabled && !valid(calculateMileage(rental, vehicle).price)) return 'Configura un precio por km extra válido en Flota o en este alquiler.'
  if (rental.kmExtraEnabled) {
    const calc = calculateMileage(rental, vehicle)
    if (!valid(calc.vatRate) || (calc.total !== undefined && (!valid(calc.total) || !Number.isSafeInteger(Math.round(calc.total * 100))))) return 'El importe de kilómetros extra está fuera del rango permitido. Revisa las lecturas y la tarifa.'
  }
}

export function missingFinalMileage(rental: Rental) {
  return rental.status === 'finalizado' && rental.kmEnd === undefined
}

export function hasMileageAlert(rental: Rental) {
  return missingFinalMileage(rental) && !rental.mileageAlertDismissed
}

export function getVehicleMileage(state: FleetState, vehicleId: string) {
  const today = new Date().toISOString().slice(0, 10)
  const vehicle = state.vehicles.find(v => v.id === vehicleId)
  const rentals = state.rentals.filter(r => r.vehicleId === vehicleId && r.status !== 'cancelado').sort((a, b) => b.startDate.localeCompare(a.startDate))
  const readings = rentals.flatMap(r => [
    ...(valid(r.kmStart) && r.status !== 'pendiente' && r.startDate <= today ? [{ km: r.kmStart, date: r.startDate }] : []),
    ...(r.status === 'finalizado' && valid(r.kmEnd) ? [{ km: r.kmEnd, date: r.endDate || r.startDate }] : []),
  ]).sort((a, b) => b.date.localeCompare(a.date) || b.km - a.km)
  const latest = readings[0]
  const currentKm = latest && (!vehicle?.lastKmUpdate || latest.date >= vehicle.lastKmUpdate) ? latest.km : vehicle?.currentKm
  return { rentals, currentKm, lastKmUpdate: latest && (!vehicle?.lastKmUpdate || latest.date >= vehicle.lastKmUpdate) ? latest.date : vehicle?.lastKmUpdate, totalUsed: rentals.reduce((n, r) => n + (calculateMileage(r).used || 0), 0) }
}

export function mileagePayment(state: FleetState, rentalId: string) {
  return state.payments.find(p => p.rentalId === rentalId && p.mileageCharge && p.status !== 'cancelado')
}

// A single state transition persists the rental, optional reviewed charge and odometer
// together in the existing owner-scoped remote JSON document.
export function saveRentalMileage(state: FleetState, rental: Rental, createCharge: boolean, today: string): FleetState {
  const vehicle = state.vehicles.find(v => v.id === rental.vehicleId)
  const error = validateMileage(rental, vehicle)
  if (error) throw new Error(error)
  const calc = calculateMileage(rental, vehicle)
  const existing = mileagePayment(state, rental.id)
  if (existing) {
    const old = state.rentals.find(r => r.id === rental.id)
    if (old && (old.vehicleId !== rental.vehicleId || old.customerId !== rental.customerId || rental.status !== 'finalizado' || !rental.kmExtraEnabled || calc.total !== existing.amount || calc.extra !== existing.kmExtraRelated || calc.price !== existing.kmExtraPrice)) {
      throw new Error('Este alquiler ya tiene un cargo de km extra. Revisa y cancela ese cargo en Pagos antes de modificar su cálculo o asociación.')
    }
  }
  if (createCharge && (rental.status !== 'finalizado' || !rental.kmExtraEnabled || !calc.total || calc.total <= 0)) throw new Error('Finaliza el alquiler y completa el kilometraje para crear el cargo revisado.')
  const paymentId = existing?.id || (createCharge ? `km-extra-${rental.id}-${state.payments.filter(p => p.rentalId === rental.id && p.mileageCharge).length + 1}` : undefined)
  const item: Rental = { ...rental, kmUsed: calc.used, kmExtraUsed: calc.extra, kmExtraDefaultPrice: rental.kmExtraDefaultPrice ?? vehicle?.extraKmRate, kmExtraVatRate: calc.vatRate, kmExtraBaseAmount: calc.base, kmExtraVatAmount: calc.vat, kmExtraTotalAmount: calc.total, kmExtraPaymentId: paymentId }
  let payments = state.payments
  if (createCharge && !existing) {
    const payment: Payment = {
      id: paymentId!, rentalId: rental.id, type: 'km_extra', mileageCharge: true, dueDate: today,
      amount: calc.total!, status: 'pendiente', recurrenceType: 'unico', reminderEnabled: true, reminderFrequency: 'once', reminderDate: today,
      kmExtraRelated: calc.extra, kmExtraPrice: calc.price, kmExtraVatRate: calc.vatRate, kmExtraBaseAmount: calc.base, kmExtraVatAmount: calc.vat,
      notes: `Cargo por ${calc.extra} km extra a ${calc.price?.toLocaleString('es-ES')} €/km + IVA ${calc.vatRate}%. Base: ${calc.base?.toFixed(2)} €. IVA: ${calc.vat?.toFixed(2)} €. Total: ${calc.total?.toFixed(2)} €.`,
    }
    payments = [...payments.filter(p => p.id !== payment.id), payment]
  }
  const next = { ...state, rentals: state.rentals.some(r => r.id === item.id) ? state.rentals.map(r => r.id === item.id ? item : r) : [item, ...state.rentals], payments }
  if (item.status === 'finalizado' && item.kmEnd !== undefined) {
    const mileage = getVehicleMileage(next, item.vehicleId)
    next.vehicles = next.vehicles.map(v => v.id === item.vehicleId ? { ...v, currentKm: mileage.currentKm, lastKmUpdate: mileage.lastKmUpdate } : v)
  }
  return next
}

export function mileageReport(state: FleetState, today = new Date().toISOString().slice(0, 10)) {
  const charges = state.payments.filter(p => p.type === 'km_extra' && p.status !== 'cancelado')
  const paid = charges.filter(p => p.status === 'pagado')
  const byVehicle = new Map<string, number>()
  const byCustomer = new Map<string, number>()
  for (const r of state.rentals.filter(r => r.status !== 'cancelado')) {
    const extra = calculateMileage(r, state.vehicles.find(v => v.id === r.vehicleId)).extra || 0
    byVehicle.set(r.vehicleId, (byVehicle.get(r.vehicleId) || 0) + extra)
    byCustomer.set(r.customerId, (byCustomer.get(r.customerId) || 0) + extra)
  }
  const monthly = new Map<string, { month: string; km: number; income: number }>()
  for (const p of paid) {
    const month = (p.paidDate || p.dueDate).slice(0, 7)
    const row = monthly.get(month) || { month, km: 0, income: 0 }
    row.km += p.kmExtraRelated || 0
    row.income = round(row.income + p.amount)
    monthly.set(month, row)
  }
  const top = (map: Map<string, number>) => [...map].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0]
  return { totalPaid: round(paid.reduce((n, p) => n + p.amount, 0)), pending: round(charges.filter(p => p.status !== 'pagado').reduce((n, p) => n + p.amount, 0)), monthIncome: monthly.get(today.slice(0, 7))?.income || 0, monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)), topVehicleId: top(byVehicle), topCustomerId: top(byCustomer), missing: state.rentals.filter(missingFinalMileage) }
}
