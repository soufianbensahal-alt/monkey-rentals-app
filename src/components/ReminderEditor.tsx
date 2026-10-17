import { useState, type FormEvent } from 'react'
import { useFleet } from '../store/FleetContext'
import { Modal, ConfirmButton } from './ui'
import { defaultTimezone, reminderCategories, validateReminder } from '../lib/reminders'
import type { CalendarEvent } from '../types'
import { uid } from '../lib/format'

export function ReminderEditor({event,date,onClose}:{event?:CalendarEvent;date:string;onClose:()=>void}) {
  const {state,upsert,remove,syncStatus}=useFleet()
  const [draft,setDraft]=useState<CalendarEvent>(()=>event?{...event,time:event.time||'09:00',timezone:event.timezone||state.adminSettings.notifications?.timezone||defaultTimezone}:{id:uid('event'),title:'',date,time:'09:00',timezone:state.adminSettings.notifications?.timezone||defaultTimezone,type:'otro',priority:'media',status:'active'})
  const [error,setError]=useState('')
  const set=(patch:Partial<CalendarEvent>)=>setDraft(d=>({...d,...patch}))
  const save=(e:FormEvent)=>{
    e.preventDefault()
    // Drop scheduled notices and repetition saved by older versions of the form.
    const next={...draft,reminders:undefined,recurrence:undefined,title:draft.title.trim(),revision:crypto.randomUUID(),createdAt:draft.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}
    const problem=validateReminder(next)
    if(problem){setError(problem);return}
    if(syncStatus==='loading'){setError('Espera a que termine la sincronización.');return}
    upsert('events',next);onClose()
  }
  const relationship=(label:string,key:'customerId'|'vehicleId'|'rentalId'|'paymentId'|'maintenanceId'|'documentId'|'debtId',options:{id:string;label:string}[])=><label><span className="label">{label} (opcional)</span><select className="field" value={draft[key]||''} onChange={e=>{
    const id=e.target.value||undefined
    const payment=key==='paymentId'?state.payments.find(p=>p.id===id):undefined
    const rental=key==='rentalId'?state.rentals.find(r=>r.id===id):payment?state.rentals.find(r=>r.id===payment.rentalId):undefined
    const maintenance=key==='maintenanceId'?state.maintenance.find(m=>m.id===id):undefined
    set({[key]:id,...(rental?{rentalId:rental.id,customerId:rental.customerId,vehicleId:rental.vehicleId}:{}),...(maintenance?{vehicleId:maintenance.vehicleId}:{})})
  }}><option value="">Sin vincular</option>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
  return <Modal title={event?'Editar alerta':'Añadir alerta'} onClose={onClose}><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
    {error&&<p role="alert" className="sm:col-span-2 text-red-700">{error}</p>}
    <label className="sm:col-span-2"><span className="label">Título</span><input className="field" required maxLength={160} value={draft.title} onChange={e=>set({title:e.target.value})}/></label>
    <label className="sm:col-span-2"><span className="label">Descripción</span><textarea className="field" maxLength={2000} value={draft.description||''} onChange={e=>set({description:e.target.value})}/></label>
    <label><span className="label">Fecha del evento</span><input className="field" type="date" required value={draft.date} onChange={e=>set({date:e.target.value})}/></label>
    <label><span className="label">Hora del evento</span><input className="field" type="time" required value={draft.time} onChange={e=>set({time:e.target.value})}/></label>
    <label><span className="label">Zona horaria</span><input className="field" required list="reminder-zones" value={draft.timezone} onChange={e=>set({timezone:e.target.value})}/><datalist id="reminder-zones"><option>Europe/Madrid</option><option>Atlantic/Canary</option><option>UTC</option></datalist></label>
    <label><span className="label">Tipo de alerta</span><select className="field" value={draft.type} onChange={e=>set({type:e.target.value as CalendarEvent['type']})}>{Object.entries(reminderCategories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label><span className="label">Prioridad</span><select className="field" value={draft.priority||'media'} onChange={e=>set({priority:e.target.value as CalendarEvent['priority']})}><option value="baja">Baja</option><option value="media">Normal</option><option value="alta">Alta</option></select></label>
    <label><span className="label">Estado</span><select className="field" value={draft.status||'active'} onChange={e=>set({status:e.target.value as CalendarEvent['status']})}><option value="active">Activa</option><option value="completed">Completada</option><option value="cancelled">Cancelada</option></select></label>
    {relationship('Cliente','customerId',state.customers.map(c=>({id:c.id,label:c.name})))}
    {relationship('Vehículo','vehicleId',state.vehicles.map(v=>({id:v.id,label:`${v.plate} · ${v.brand} ${v.model}`})))}
    {relationship('Alquiler / reserva','rentalId',state.rentals.map(r=>({id:r.id,label:`${state.customers.find(c=>c.id===r.customerId)?.name||'Cliente'} · ${r.startDate} → ${r.endDate||'Sin fecha final'}`})))}
    {relationship('Pago','paymentId',state.payments.map(p=>({id:p.id,label:`${p.amount} € · ${p.dueDate} · ${state.customers.find(c=>c.id===state.rentals.find(r=>r.id===p.rentalId)?.customerId)?.name||'Cliente'}`})))}
    {relationship('Mantenimiento','maintenanceId',state.maintenance.map(m=>({id:m.id,label:`${m.type} · ${m.date}`})))}
    {relationship('ITV / Documento','documentId',state.documents.map(d=>({id:d.id,label:`${d.type} · ${d.expiryDate}`})))}
    {relationship('Deuda','debtId',(state.debts||[]).map(d=>({id:d.id,label:`${d.customerName} · ${d.reason}`})))}
    <label className="sm:col-span-2"><span className="label">Notas</span><textarea className="field" maxLength={4000} value={draft.notes||''} onChange={e=>set({notes:e.target.value})}/></label>
    <p className="text-xs text-stone-500 sm:col-span-2">La alerta aparecerá en la app (Calendario, Alertas y el panel de notificaciones).</p>
    <div className="flex flex-wrap justify-end gap-3 sm:col-span-2">{event&&<ConfirmButton title="Eliminar alerta" message="¿Eliminar esta alerta y cancelar todos sus próximos avisos?" onConfirm={()=>{remove('events',event.id);onClose()}}/>}<button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={syncStatus==='loading'}>Guardar alerta</button></div>
  </form></Modal>
}
