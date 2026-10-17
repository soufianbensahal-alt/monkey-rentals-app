import { Temporal } from '@js-temporal/polyfill'
import type { CalendarEvent, FleetState, Priority, ReminderCategory } from '../types'
export const reminderCategories:Record<ReminderCategory,string>={pago:'Pago',alquiler:'Alquiler',reserva:'Reserva',itv:'ITV',mantenimiento:'Mantenimiento',impuesto:'Impuesto',multa:'Multa',documento:'Documentación',entrega:'Entrega de vehículo','devolución':'Devolución de vehículo',otro:'Otro'}
export const defaultTimezone='Europe/Madrid'
export interface ReminderOccurrence {event:CalendarEvent;date:string;time:string;at:string;key:string}
export function zonedEvent(event:CalendarEvent,date=event.date) {
  // Reject nonexistent/ambiguous initial wall-clock times rather than silently changing a user's appointment.
  return Temporal.PlainDateTime.from(`${date}T${event.time || '09:00'}`).toZonedDateTime(event.timezone || defaultTimezone,{disambiguation:'reject'})
}
// Scheduled notices and repetition were removed: stored reminders/recurrence on old events are ignored.
export function validateReminder(event:CalendarEvent):string|undefined {
  try {
    if(!event.id || !event.title.trim() || event.title.length>160 || !Object.hasOwn(reminderCategories,event.type)) return 'Introduce un título de hasta 160 caracteres y un tipo válido.'
    if(!event.time || !/^\d{2}:\d{2}$/.test(event.time) || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return 'Indica fecha y hora del evento.'
    zonedEvent(event)
    if(event.description && event.description.length>2000 || event.notes && event.notes.length>4000) return 'Acorta la descripción o las notas.'
  } catch { return 'Revisa la fecha, la zona horaria y las horas. Esa hora puede no existir o repetirse durante el cambio de horario.' }
}
export function occurrences(event:CalendarEvent,from:string,to:string):ReminderOccurrence[] {
  if(!event.time || event.status==='cancelled' || event.status==='completed' || validateReminder(event) || event.date<from || event.date>to) return []
  const at=zonedEvent(event)
  return [{event,date:event.date,time:event.time,at:at.toInstant().toString(),key:`${event.id}:${event.date}`}]
}
const priorityRank:Record<Priority,number>={alta:0,media:1,baja:2}
// Highest priority first; within the same priority, the most recently created alert first.
export function byPriority(a:ReminderOccurrence,b:ReminderOccurrence) {
  return priorityRank[a.event.priority||'media']-priorityRank[b.event.priority||'media'] || (b.event.createdAt||'').localeCompare(a.event.createdAt||'') || a.at.localeCompare(b.at)
}
export function reminderDetails(event:CalendarEvent,state:FleetState) {
  const customer=state.customers.find(c=>c.id===event.customerId)
  const vehicle=state.vehicles.find(v=>v.id===event.vehicleId)
  const payment=state.payments.find(p=>p.id===event.paymentId)
  return [event.description,customer?.name,vehicle && `${vehicle.plate} · ${vehicle.brand} ${vehicle.model}`,payment && `${payment.amount} € · ${payment.dueDate}`].filter(Boolean).join(' · ')
}
export function dateInZone(now=new Date(),timezone=defaultTimezone) {return Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO(timezone).toPlainDate().toString()}
export function upcomingReminders(state:FleetState,now=new Date()) {
  const today=dateInZone(now,state.adminSettings.notifications?.timezone)
  const end=Temporal.PlainDate.from(today).add({days:90}).toString()
  return state.events.flatMap(event=>occurrences(event,event.date,end)).sort(byPriority)
}
