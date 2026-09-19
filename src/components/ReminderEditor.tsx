import { useState, type FormEvent } from 'react'
import { useFleet } from '../store/FleetContext'
import { Modal, ConfirmButton } from './ui'
import { defaultTimezone, offsetLabel, offsetUnits, recurrenceUnits, reminderCategories, validateReminder, zonedEvent, reminderInstant } from '../lib/reminders'
import type { CalendarEvent, ReminderOffset, ReminderRecurrence } from '../types'
import { uid } from '../lib/format'

const presets=[0,15,30,60,120,360,720,1440,2880,4320,10080]
const fromMinutes=(minutes:number):ReminderOffset=>minutes>=10080?{value:minutes/10080,unit:'weeks'}:minutes>=1440?{value:minutes/1440,unit:'days'}:minutes>=60?{value:minutes/60,unit:'hours'}:{value:minutes,unit:'minutes'}
export function ReminderEditor({event,date,onClose}:{event?:CalendarEvent;date:string;onClose:()=>void}) {
  const {state,upsert,remove,syncStatus}=useFleet()
  const [draft,setDraft]=useState<CalendarEvent>(()=>event?{...event,time:event.time||'09:00',timezone:event.timezone||state.adminSettings.notifications?.timezone||defaultTimezone,reminders:event.reminders||[{value:0,unit:'minutes'}]}:{id:uid('event'),title:'',date,time:'09:00',timezone:state.adminSettings.notifications?.timezone||defaultTimezone,type:'otro',reminders:[{value:0,unit:'minutes'}],priority:'media',status:'active'})
  const [customOffsets,setCustomOffsets]=useState<number[]>(()=>draft.reminders!.flatMap((o,i)=>presets.includes(o.value*({minutes:1,hours:60,days:1440,weeks:10080}[o.unit]))?[]:[i]))
  const [customRepeat,setCustomRepeat]=useState(Boolean(event?.recurrence&&!['days:1','weeks:1','weeks:2','months:1','years:1'].includes(`${event.recurrence.unit}:${event.recurrence.interval}`)))
  const [error,setError]=useState('')
  const set=(patch:Partial<CalendarEvent>)=>setDraft(d=>({...d,...patch}))
  const changeOffset=(index:number,offset:ReminderOffset)=>set({reminders:draft.reminders!.map((o,i)=>i===index?offset:o)})
  const save=(e:FormEvent)=>{
    e.preventDefault()
    const next={...draft,title:draft.title.trim(),revision:crypto.randomUUID(),createdAt:draft.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}
    const problem=validateReminder(next)
    if(problem){setError(problem);return}
    if(syncStatus==='loading'){setError('Espera a que termine la sincronización.');return}
    upsert('events',next);onClose()
  }
  const relationship=(label:string,key:'customerId'|'vehicleId'|'rentalId'|'paymentId'|'maintenanceId',options:{id:string;label:string}[])=><label><span className="label">{label} (opcional)</span><select className="field" value={draft[key]||''} onChange={e=>{
    const id=e.target.value||undefined
    const payment=key==='paymentId'?state.payments.find(p=>p.id===id):undefined
    const rental=key==='rentalId'?state.rentals.find(r=>r.id===id):payment?state.rentals.find(r=>r.id===payment.rentalId):undefined
    const maintenance=key==='maintenanceId'?state.maintenance.find(m=>m.id===id):undefined
    set({[key]:id,...(rental?{rentalId:rental.id,customerId:rental.customerId,vehicleId:rental.vehicleId}:{}),...(maintenance?{vehicleId:maintenance.vehicleId}:{})})
  }}><option value="">Sin vincular</option>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
  let previews:string[]=[]
  try { previews=draft.reminders!.map(o=>new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'short',timeZone:draft.timezone}).format(new Date(reminderInstant(zonedEvent(draft),o)))) } catch { /* Validation explains incomplete fields on save. */ }
  const recurrenceValue=!draft.recurrence?'none':customRepeat?'custom':`${draft.recurrence.unit}:${draft.recurrence.interval}`
  return <Modal title={event?'Editar alerta':'Añadir alerta'} onClose={onClose}><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
    {error&&<p role="alert" className="sm:col-span-2 text-red-700">{error}</p>}
    <label className="sm:col-span-2"><span className="label">Título</span><input className="field" required maxLength={160} value={draft.title} onChange={e=>set({title:e.target.value})}/></label>
    <label className="sm:col-span-2"><span className="label">Descripción</span><textarea className="field" maxLength={2000} value={draft.description||''} onChange={e=>set({description:e.target.value})}/></label>
    <label><span className="label">Fecha del evento</span><input className="field" type="date" required value={draft.date} onChange={e=>set({date:e.target.value})}/></label>
    <label><span className="label">Hora del evento</span><input className="field" type="time" required value={draft.time} onChange={e=>set({time:e.target.value})}/></label>
    <label><span className="label">Zona horaria</span><input className="field" required list="reminder-zones" value={draft.timezone} onChange={e=>set({timezone:e.target.value})}/><datalist id="reminder-zones"><option>Europe/Madrid</option><option>Atlantic/Canary</option><option>UTC</option></datalist></label>
    <label><span className="label">Tipo de alerta</span><select className="field" value={draft.type} onChange={e=>set({type:e.target.value as CalendarEvent['type']})}>{Object.entries(reminderCategories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <fieldset className="sm:col-span-2 space-y-3 rounded-xl border border-orange-100 p-4"><legend className="px-1 font-bold">Avisarme</legend>{draft.reminders!.map((offset,index)=>{
      const minutes=offset.value*({minutes:1,hours:60,days:1440,weeks:10080}[offset.unit])
      return <div key={index} className="grid gap-3 sm:grid-cols-2"><label><span className="label">Aviso {index+1}</span><select className="field" value={customOffsets.includes(index)?'custom':minutes} onChange={e=>{
        if(e.target.value==='custom')setCustomOffsets([...customOffsets,index])
        else {setCustomOffsets(customOffsets.filter(i=>i!==index));changeOffset(index,{...fromMinutes(Number(e.target.value)),time:offset.time})}
      }}>{presets.map(m=><option key={m} value={m}>{offsetLabel(fromMinutes(m))}</option>)}<option value="custom">Personalizado</option></select></label>
      {customOffsets.includes(index)&&<div className="grid grid-cols-2 gap-2"><label><span className="label">Cantidad</span><input className="field" type="number" min="0" max="525600" required value={offset.value} onChange={e=>changeOffset(index,{...offset,value:Number(e.target.value)})}/></label><label><span className="label">Unidad</span><select className="field" value={offset.unit} onChange={e=>changeOffset(index,{...offset,unit:e.target.value as ReminderOffset['unit']})}>{Object.entries(offsetUnits).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>}
      <label><span className="label">Hora exacta del aviso (opcional)</span><input className="field" type="time" value={offset.time||''} onChange={e=>changeOffset(index,{...offset,time:e.target.value||undefined})}/><span className="text-xs text-stone-500">Vacío: se calcula a partir de la hora del evento.</span></label>
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2"><span className="text-sm font-semibold">{previews[index]?`${previews[index]} · ${draft.timezone}`:'Completa la fecha y el aviso'}</span>{draft.reminders!.length>1&&<button className="btn-secondary" type="button" onClick={()=>{set({reminders:draft.reminders!.filter((_,i)=>i!==index)});setCustomOffsets(customOffsets.filter(i=>i!==index).map(i=>i>index?i-1:i))}}>Quitar aviso</button>}</div></div>
    })}{draft.reminders!.length<5&&<button className="btn-secondary" type="button" onClick={()=>set({reminders:[...draft.reminders!,{value:1,unit:'days'}]})}>Añadir otro aviso</button>}</fieldset>
    <label><span className="label">Repetir alerta</span><select className="field" value={recurrenceValue} onChange={e=>{
      const value=e.target.value
      setCustomRepeat(value==='custom')
      if(value==='none')set({recurrence:undefined})
      else if(value==='custom')set({recurrence:{unit:'days',interval:1}})
      else {const [unit,interval]=value.split(':');set({recurrence:{unit:unit as ReminderRecurrence['unit'],interval:Number(interval)}})}
    }}><option value="none">No repetir</option><option value="days:1">Cada día</option><option value="weeks:1">Cada semana</option><option value="weeks:2">Cada 2 semanas</option><option value="months:1">Cada mes</option><option value="years:1">Cada año</option><option value="custom">Personalizado</option></select></label>
    {customRepeat&&draft.recurrence&&<div className="grid grid-cols-2 gap-2"><label><span className="label">Cada</span><input className="field" type="number" min="1" max="365" required value={draft.recurrence.interval} onChange={e=>set({recurrence:{...draft.recurrence!,interval:Number(e.target.value)}})}/></label><label><span className="label">Unidad de repetición</span><select className="field" value={draft.recurrence.unit} onChange={e=>set({recurrence:{...draft.recurrence!,unit:e.target.value as ReminderRecurrence['unit']}})}>{Object.entries(recurrenceUnits).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>}
    <label><span className="label">Prioridad</span><select className="field" value={draft.priority||'media'} onChange={e=>set({priority:e.target.value as CalendarEvent['priority']})}><option value="baja">Baja</option><option value="media">Normal</option><option value="alta">Alta</option></select></label>
    <label><span className="label">Estado</span><select className="field" value={draft.status||'active'} onChange={e=>set({status:e.target.value as CalendarEvent['status']})}><option value="active">Activa</option><option value="completed">Completada</option><option value="cancelled">Cancelada</option></select></label>
    {relationship('Cliente','customerId',state.customers.map(c=>({id:c.id,label:c.name})))}
    {relationship('Vehículo','vehicleId',state.vehicles.map(v=>({id:v.id,label:`${v.plate} · ${v.brand} ${v.model}`})))}
    {relationship('Alquiler / reserva','rentalId',state.rentals.map(r=>({id:r.id,label:`${state.customers.find(c=>c.id===r.customerId)?.name||'Cliente'} · ${r.startDate} → ${r.endDate||'Sin fecha final'}`})))}
    {relationship('Pago','paymentId',state.payments.map(p=>({id:p.id,label:`${p.amount} € · ${p.dueDate} · ${state.customers.find(c=>c.id===state.rentals.find(r=>r.id===p.rentalId)?.customerId)?.name||'Cliente'}`})))}
    {relationship('Mantenimiento','maintenanceId',state.maintenance.map(m=>({id:m.id,label:`${m.type} · ${m.date}`})))}
    <label className="sm:col-span-2"><span className="label">Notas</span><textarea className="field" maxLength={4000} value={draft.notes||''} onChange={e=>set({notes:e.target.value})}/></label>
    <p className="text-xs text-stone-500 sm:col-span-2">La alerta aparecerá en la app. Para recibir avisos en el dispositivo, activa las notificaciones en Configuración. Si editas una alerta repetida, se modifica toda la serie.</p>
    <div className="flex flex-wrap justify-end gap-3 sm:col-span-2">{event&&<ConfirmButton title="Eliminar alerta" message="¿Eliminar esta alerta y cancelar todos sus próximos avisos?" onConfirm={()=>{remove('events',event.id);onClose()}}/>}<button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={syncStatus==='loading'}>Guardar alerta</button></div>
  </form></Modal>
}
