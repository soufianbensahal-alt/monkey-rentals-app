import type { Payment, PaymentStatus } from '../types'

export function effectivePaymentStatus(payment: Payment): PaymentStatus {
  if (payment.status === 'pagado' || payment.status === 'flexible') return payment.status
  return payment.dueDate < new Date().toISOString().slice(0, 10) ? 'atrasado' : 'pendiente'
}

export function daysUntil(date: string) {
  const today = new Date(); today.setHours(0,0,0,0)
  const target = new Date(`${date}T00:00:00`)
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
}

export function isPaymentAlert(payment: Payment) {
  const status = effectivePaymentStatus(payment)
  return status === 'flexible' || status === 'atrasado' || (status === 'pendiente' && daysUntil(payment.dueDate) <= 3)
}
