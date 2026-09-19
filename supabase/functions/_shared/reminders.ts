// Generated from src/lib/reminders.ts. Run npm run notifications:prepare.
import { Temporal } from '@js-temporal/polyfill'
import type { CalendarEvent, FleetState, ReminderCategory, ReminderOffset } from './types.ts'
export const reminderCategories:Record<ReminderCategory,string>={pago:'Pago',alquiler:'Alquiler',reserva:'Reserva',itv:'ITV',mantenimiento:'Mantenimiento',impuesto:'Impuesto',multa:'Multa',documento:'Documentación',entrega:'Entrega de vehículo','devolución':'Devolución de vehículo',otro:'Otro'}
export const offsetUnits={minutes:'Minutos',hours:'Horas',days:'Días',weeks:'Semanas'}
export const recurrenceUnits={days:'Días',weeks:'Semanas',months:'Meses',years:'Años'}
export const defaultTimezone='Europe/Madrid'
export interface ReminderOccurrence {event:CalendarEvent;date:string;time:string;at:string;key:string;notifications:{at:string;index:number}[]}
export function zonedEvent(event:CalendarEvent,date=event.date) {
  // Reject nonexistent/ambiguous initial wall-clock times rather than silently changing a user's appointment.
  return Temporal.PlainDateTime.from(`${date}T${event.time || '09:00'}`).toZonedDateTime(event.timezone || defaultTimezone,{disambiguation:'reject'})
}
export function reminderInstant(at:Temporal.ZonedDateTime, offset:ReminderOffset) {
  let notice=at.subtract({[offset.unit]:offset.value})
  if(offset.time) notice=notice.withPlainTime(offset.time)
  if(Temporal.ZonedDateTime.compare(notice,at)>0) throw new Error('La hora de aviso no puede ser posterior al evento.')
  return notice.toInstant().toString()
}
export function validateReminder(event:CalendarEvent):string|undefined {
  try {
    if(!event.id || !event.title.trim() || event.title.length>160 || !Object.hasOwn(reminderCategories,event.type)) return 'Introduce un título de hasta 160 caracteres y un tipo válido.'
    if(!event.time || !/^\d{2}:\d{2}$/.test(event.time) || !/^\d{4}-\d{2}-\d{2}$/.test(event.date)) return 'Indica fecha y hora del evento.'
    const at=zonedEvent(event)
    if(!event.reminders?.length || event.reminders.length>5) return 'Configura entre uno y cinco avisos.'
    const seen=new Set<string>()
    for(const offset of event.reminders) {
      if(!Object.hasOwn(offsetUnits,offset.unit) || !Number.isInteger(offset.value) || offset.value<0 || offset.value*({minutes:1,hours:60,days:1440,weeks:10080}[offset.unit])>525600) return 'La antelación debe estar entre 0 minutos y 365 días.'
      if(offset.time && !/^\d{2}:\d{2}$/.test(offset.time)) return 'La hora del aviso no es válida.'
      const notice=reminderInstant(at,offset)
      if(seen.has(notice)) return 'Hay dos avisos programados para el mismo momento.'
      seen.add(notice)
    }
    if(event.recurrence && (!Object.hasOwn(recurrenceUnits,event.recurrence.unit) || !Number.isInteger(event.recurrence.interval) || event.recurrence.interval<1 || event.recurrence.interval>365)) return 'La repetición debe tener un intervalo entre 1 y 365.'
    if(event.description && event.description.length>2000 || event.notes && event.notes.length>4000) return 'Acorta la descripción o las notas.'
  } catch { return 'Revisa la fecha, la zona horaria y las horas. Esa hora puede no existir o repetirse durante el cambio de horario.' }
}
// Generate occurrences from the original date: Jan 31 -> Feb 28 -> Mar 31 (no drift).
export function occurrences(event:CalendarEvent,from:string,to:string):ReminderOccurrence[] {
  if(!event.time || !event.reminders?.length || event.status==='cancelled' || event.status==='completed' || validateReminder(event)) return []
  const base=Temporal.PlainDate.from(event.date), start=Temporal.PlainDate.from(from), end=Temporal.PlainDate.from(to)
  const repeat=event.recurrence
  let index=0
  if(repeat && Temporal.PlainDate.compare(start,base)>0) {
    const difference=base.until(start,{largestUnit:repeat.unit})
    index=Math.max(0,Math.floor(difference[repeat.unit]/repeat.interval)-1)
  }
  const result:ReminderOccurrence[]=[]
  for(let count=0;count<2000;count++,index++) {
    const day=repeat?base.add({[repeat.unit]:index*repeat.interval}):base
    if(Temporal.PlainDate.compare(day,end)>0)break
    if(Temporal.PlainDate.compare(day,start)>=0) {
      try {
        // Recurrences retain wall clock time; on DST gaps use the next valid clock time.
        const at=Temporal.PlainDateTime.from(`${day}T${event.time}`).toZonedDateTime(event.timezone || defaultTimezone,{disambiguation:'compatible'})
        result.push({event,date:day.toString(),time:at.toPlainTime().toString().slice(0,5),at:at.toInstant().toString(),key:`${event.id}:${day}`,notifications:event.reminders.map((offset,index)=>({at:reminderInstant(at,offset),index}))})
      } catch { /* Invalid recurrence offsets are not scheduled. */ }
    }
    if(!repeat)break
  }
  return result
}
export function offsetLabel(offset:ReminderOffset) {
  return `${offset.value===0?'En el momento':`${offset.value} ${offsetUnits[offset.unit].toLowerCase()} antes`}${offset.time?` a las ${offset.time}`:''}`
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
  return state.events.flatMap(event=>occurrences(event,today,end)).sort((a,b)=>a.at.localeCompare(b.at))
}
