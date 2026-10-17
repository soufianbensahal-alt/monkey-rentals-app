import { describe, expect, it } from 'vitest'
import { dateInZone, occurrences, upcomingReminders, validateReminder } from './reminders'
import { createBackup, parseBackup } from './backups'
import { emptyState } from '../data/emptyState'
import type { CalendarEvent } from '../types'
const event:CalendarEvent={id:'itv',title:'ITV Fiat Dobló',date:'2026-10-20',time:'10:00',timezone:'Europe/Madrid',type:'itv',priority:'alta',reminders:[{value:1,unit:'days',time:'09:00'}],revision:'rev1'}
describe('alertas sin avisos programados',()=>{
  it('valida fecha, hora y cambio de horario sin exigir avisos',()=>{
    expect(validateReminder({...event,reminders:undefined})).toBeUndefined()
    expect(validateReminder({...event,time:''})).toContain('fecha y hora')
    expect(validateReminder({...event,date:'2026-03-29',time:'02:30'})).toContain('cambio de horario')
    expect(validateReminder({...event,date:'2026-10-25',time:'02:30'})).toContain('cambio de horario')
  })
  it('muestra cada alerta una sola vez en su fecha e ignora avisos y repeticiones guardados',()=>{
    const daily={...event,date:'2026-03-28',recurrence:{unit:'days' as const,interval:1},reminders:[{value:0,unit:'minutes' as const}]}
    expect(occurrences(daily,'2026-03-28','2026-03-30').map(o=>[o.date,o.at])).toEqual([['2026-03-28','2026-03-28T09:00:00Z']])
    expect(occurrences({...event,reminders:undefined},event.date,event.date)).toHaveLength(1)
  })
  it('no muestra eventos sin hora, cancelados, completados o fuera del rango',()=>{
    expect(occurrences({id:'legacy',title:'Antiguo',date:event.date,type:'reserva'},event.date,event.date)).toEqual([])
    expect(occurrences({...event,status:'completed'},event.date,event.date)).toEqual([])
    expect(occurrences({...event,status:'cancelled'},event.date,event.date)).toEqual([])
    expect(occurrences({...event,date:'2026-11-01'},event.date,event.date)).toEqual([])
  })
  it('ordena por prioridad y, a igual prioridad, las más recientes primero',()=>{
    const mk=(id:string,priority:CalendarEvent['priority'],createdAt:string)=>({...event,id,priority,createdAt})
    const state={...structuredClone(emptyState),events:[mk('baja','baja','2026-10-03'),mk('normal-antigua','media','2026-10-01'),mk('alta','alta','2026-09-01'),mk('normal-reciente','media','2026-10-02'),{...mk('sin-prioridad',undefined,'2026-09-15')}]}
    expect(upcomingReminders(state,new Date('2026-10-10T12:00:00Z')).map(o=>o.event.id)).toEqual(['alta','normal-reciente','normal-antigua','sin-prioridad','baja'])
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

// Past active events must remain visible until explicitly resolved.
it('mantiene una ITV pasada pendiente aunque el aviso ya se haya enviado',()=>{
 const state={...emptyState,events:[{id:'past-itv',title:'ITV pendiente',date:'2026-09-01',time:'09:00',timezone:'Europe/Madrid',type:'itv' as const,status:'active' as const,reminders:[{value:0,unit:'minutes' as const}]}]}
 expect(upcomingReminders(state,new Date('2026-09-28T12:00:00Z')).map(o=>o.event.id)).toContain('past-itv')
 expect(upcomingReminders({...state,events:[{...state.events[0],status:'completed'}]},new Date('2026-09-28T12:00:00Z'))).toHaveLength(0)
})
