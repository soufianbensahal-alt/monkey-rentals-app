import type { Payment, PaymentType, PricePeriod, RecurrenceType, ReminderFrequency } from '../types'

export const paymentTypeLabels: Record<PaymentType, string> = {
  normal: 'Alquiler',
  flexible: 'Pago flexible',
  fianza: 'Fianza',
  penalizacion: 'Penalización',
  km_extra: 'Km extra',
  multa: 'Multa',
  otro: 'Otro',
}

export const reminderFrequencyLabels: Record<ReminderFrequency, string> = {
  none: 'Sin recordatorio',
  once: 'Una vez',
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  custom: 'Personalizado',
}

export function suggestedReminderFrequency(period: PricePeriod): ReminderFrequency {
  if (period === 'dia' || period === 'otro') return 'once'
  if (period === 'semana') return 'weekly'
  return 'monthly'
}

export function recurrenceFromFrequency(frequency: ReminderFrequency): RecurrenceType {
  return ['daily', 'weekly', 'biweekly', 'monthly', 'custom'].includes(frequency) ? 'recurrente' : 'unico'
}

export function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`)
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

export function addMonths(date: string, months: number) {
  const next = new Date(`${date}T12:00:00`)
  next.setMonth(next.getMonth() + months)
  return next.toISOString().slice(0, 10)
}

export function getNextPaymentDate(payment: Payment) {
  const frequency = payment.reminderFrequency || (payment.recurrenceType === 'recurrente' ? 'monthly' : 'none')
  const interval = Math.max(1, Number(payment.recurrenceInterval) || 1)
  if (!payment.reminderEnabled || frequency === 'none' || frequency === 'once') return null
  if (frequency === 'daily') return addDays(payment.dueDate, interval)
  if (frequency === 'weekly') return addDays(payment.dueDate, interval * 7)
  if (frequency === 'biweekly') return addDays(payment.dueDate, interval * 14)
  if (frequency === 'custom') return addDays(payment.dueDate, interval)
  return addMonths(payment.dueDate, interval)
}

export function isFlexiblePayment(payment: Payment) {
  return payment.status === 'flexible' || payment.type === 'flexible' || payment.isFlexible
}

export function paymentKindLabel(payment: Payment) {
  return paymentTypeLabels[payment.type || (payment.status === 'flexible' ? 'flexible' : 'normal')]
}

export function paymentReminderLabel(payment: Payment) {
  const frequency = payment.reminderFrequency || 'none'
  if (!payment.reminderEnabled || frequency === 'none') return 'Sin recordatorio'
  if (frequency === 'custom') return `Cada ${Math.max(1, Number(payment.recurrenceInterval) || 1)} días`
  return reminderFrequencyLabels[frequency]
}
