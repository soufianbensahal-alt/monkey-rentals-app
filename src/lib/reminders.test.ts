import { describe, expect, it } from 'vitest'
import { dateInZone, occurrences, reminderInstant, validateReminder, zonedEvent } from './reminders'
import { createBackup, parseBackup } from './backups'
import { emptyState } from '../data/emptyState'
import type { CalendarEvent } from '../types'
const event:CalendarEvent={id:'itv',title:'ITV Fiat Dobló',date:'2026-10-20',time:'10:00',timezone:'Europe/Madrid',type:'itv',priority:'alta',reminders:[{value:1,unit:'days',time:'09:00'}],revision:'rev1'}
describe('programación de recordatorios',()=>{
  it('calcula fecha y hora exacta en la zona del evento',()=>{
    expect(validateReminder(event)).toBeUndefined()
    expect(reminderInstant(zonedEvent(event),event.reminders![0])).toBe('2026-10-19T07:00:00Z')
    expect(reminderInstant(zonedEvent(event),{value:2,unit:'hours'})).toBe('2026-10-20T06:00:00Z')
    const gestor={...event,type:'otro' as const,title:'Llamar al gestor',date:'2026-09-25',time:'11:30',reminders:[{value:30,unit:'minutes' as const}]}
    expect(occurrences(gestor,'2026-09-25','2026-09-25')[0].notifications[0].at).toBe('2026-09-25T09:00:00Z')
  })
  it('admite varios avisos y rechaza duplicados o avisos posteriores al evento',()=>{
    const multiple={...event,date:'2026-09-22',time:'18:00',reminders:[{value:1,unit:'days' as const},{value:1,unit:'hours' as const}]}
    expect(occurrences(multiple,'2026-09-22','2026-09-22')[0].notifications.map(n=>n.at)).toEqual(['2026-09-21T16:00:00Z','2026-09-22T15:00:00Z'])
    expect(validateReminder({...event,reminders:[{value:1,unit:'hours'},{value:60,unit:'minutes'}]})).toContain('dos avisos')
    expect(validateReminder({...event,reminders:[{value:0,unit:'minutes',time:'11:00'}]})).toContain('Revisa')
    expect(validateReminder({...event,reminders:[{value:-1,unit:'days'}]})).toContain('antelación')
  })
  it('respeta el horario de verano, el día 31 y los años bisiestos',()=>{
    const daily={...event,date:'2026-03-28',time:'10:00',recurrence:{unit:'days' as const,interval:1},reminders:[{value:0,unit:'minutes' as const}]}
    expect(occurrences(daily,'2026-03-28','2026-03-30').map(o=>o.at)).toEqual(['2026-03-28T09:00:00Z','2026-03-29T08:00:00Z','2026-03-30T08:00:00Z'])
    const monthly={...daily,date:'2026-01-31',recurrence:{unit:'months' as const,interval:1}}
    expect(occurrences(monthly,'2026-01-01','2026-04-30').map(o=>o.date)).toEqual(['2026-01-31','2026-02-28','2026-03-31','2026-04-30'])
    const yearly={...daily,date:'2024-02-29',recurrence:{unit:'years' as const,interval:1}}
    expect(occurrences(yearly,'2025-01-01','2028-12-31').map(o=>o.date)).toEqual(['2025-02-28','2026-02-28','2027-02-28','2028-02-29'])
    expect(validateReminder({...event,date:'2026-03-29',time:'02:30'})).toContain('cambio de horario')
    expect(validateReminder({...event,date:'2026-10-25',time:'02:30'})).toContain('cambio de horario')
  })
  it('no convierte eventos antiguos en push y no programa cancelados o completados',()=>{
    expect(occurrences({id:'legacy',title:'Antiguo',date:event.date,type:'reserva'},event.date,event.date)).toEqual([])
    expect(occurrences({...event,status:'completed'},event.date,event.date)).toEqual([])
    expect(occurrences({...event,status:'cancelled'},event.date,event.date)).toEqual([])
    expect(occurrences({...event,date:'2026-11-01'},event.date,event.date)).toEqual([])
  })
  it('mantiene la zona de negocio aunque el dispositivo esté en otro día',()=>{
    expect(dateInZone(new Date('2026-09-25T23:30:00Z'),'Europe/Madrid')).toBe('2026-09-26')
    expect(dateInZone(new Date('2026-09-25T23:30:00Z'),'America/New_York')).toBe('2026-09-25')
  })
  it('incluye programación y preferencias en las copias y acepta copias antiguas',()=>{
    const state={...structuredClone(emptyState),events:[event]}
    state.adminSettings.notifications={enabled:true,categories:['itv'],timezone:'Europe/Madrid'}
    const backup=createBackup(state,'user-a')
    expect(parseBackup(JSON.stringify(backup),'user-a').data.events).toEqual([event])
    expect(createBackup(emptyState,'user-a').data.events).toEqual([])
  })
})
