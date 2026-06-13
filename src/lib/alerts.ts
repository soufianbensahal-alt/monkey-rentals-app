import { daysUntil, effectivePaymentStatus, isPaymentAlert } from './payments'
import { vehicleLabel } from './vehicles'
import type { FleetState } from '../types'

export interface SystemAlert {
  id: string
  title: string
  detail: string
  date: string
  severity: 'danger' | 'warning' | 'info'
  to: string
  paymentId?: string
}

export function getSystemAlerts(state: FleetState): SystemAlert[] {
  const payments = state.payments.filter(isPaymentAlert).map(payment => {
    const rental = state.rentals.find(item => item.id === payment.rentalId)
    const customer = state.customers.find(item => item.id === rental?.customerId)
    const status = effectivePaymentStatus(payment)
    return { id:`payment-${payment.id}`, title:status === 'atrasado' ? 'Pago atrasado' : 'Próximo cobro', detail:`${customer?.name || 'Cliente'} · ${payment.amount.toLocaleString('es-ES',{style:'currency',currency:'EUR'})}`, date:payment.dueDate, severity:status === 'atrasado' ? 'danger' as const : 'warning' as const, to:'/app/pagos', paymentId:payment.id }
  })
  const documents = state.documents.filter(item => daysUntil(item.expiryDate) <= 30).map(item => {
    const days = daysUntil(item.expiryDate); const vehicle = state.vehicles.find(v => v.id === item.vehicleId)
    return { id:`document-${item.id}`, title:days < 0 ? `${item.type} caducada` : `${item.type} próxima a vencer`, detail:`${vehicleLabel(vehicle)} · ${vehicle?.plate || ''}`, date:item.expiryDate, severity:days < 0 ? 'danger' as const : 'warning' as const, to:`/app/documentacion?vehicle=${item.vehicleId}` }
  })
  const taxes = state.taxes.filter(item => item.status === 'pendiente' && daysUntil(item.dueDate) <= 14).map(item => {
    const days = daysUntil(item.dueDate); const vehicle = state.vehicles.find(v => v.id === item.vehicleId)
    return { id:`tax-${item.id}`, title:days < 0 ? 'Impuesto pendiente vencido' : 'Impuesto próximo', detail:`${item.concept} · ${vehicleLabel(vehicle)}`, date:item.dueDate, severity:days < 0 ? 'danger' as const : 'warning' as const, to:`/app/documentacion?vehicle=${item.vehicleId}` }
  })
  const maintenance = state.maintenance.filter(item => item.status === 'programado' && daysUntil(item.date) <= 14).map(item => {
    const days = daysUntil(item.date); const vehicle = state.vehicles.find(v => v.id === item.vehicleId)
    return { id:`maintenance-${item.id}`, title:days < 0 ? 'Mantenimiento atrasado' : 'Mantenimiento programado', detail:`${item.type} · ${vehicleLabel(vehicle)}`, date:item.date, severity:days < 0 ? 'danger' as const : 'info' as const, to:`/app/documentacion?vehicle=${item.vehicleId}` }
  })
  const fines = state.fines.filter(item => item.status === 'pendiente' || item.status === 'reclamada').map(item => {
    const vehicle = state.vehicles.find(v => v.id === item.vehicleId)
    const customer = state.customers.find(c => c.id === item.customerId)
    return { id:`fine-${item.id}`, title:item.status === 'reclamada' ? 'Multa reclamada' : 'Multa pendiente', detail:`${vehicleLabel(vehicle)} · ${customer?.name || 'Sin cliente vinculado'}`, date:item.infractionDate, severity:'warning' as const, to:`/app/documentacion?vehicle=${item.vehicleId}` }
  })
  return [...payments,...documents,...taxes,...maintenance,...fines].sort((a,b)=>a.date.localeCompare(b.date))
}
