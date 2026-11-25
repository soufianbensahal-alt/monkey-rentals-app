import { useState, type FormEvent } from 'react'
import { Banknote, Users, TrendingUp } from 'lucide-react'
import { useFleet } from '../store/FleetContext'
import { debtBalance, debtPaymentHistory, debtSummary, validateDebtPayment } from '../lib/debts'
import { euroWithCents as money, date, uid } from '../lib/format'
import { Badge, Modal, StatCard } from './ui'
import { ReminderEditor } from './ReminderEditor'
import type { CalendarEvent, ClientDebt } from '../types'
import { activeVehicles } from '../lib/vehicles'
const today=()=>new Date().toISOString().slice(0,10)
export function DebtStats({reports=false}:{reports?:boolean}) {
  const {state}=useFleet(),s=debtSummary(state)
  return <section className="my-5 grid gap-4 sm:grid-cols-3" aria-label="Resumen de deudas">
    <StatCard label="Deuda pendiente" value={money.format(s.pending)} detail="Saldo de deudas registradas" icon={Banknote} valueTone={s.pending?'red':'green'}/>
    <StatCard label="Deudas recuperadas este mes" value={money.format(s.monthRecovered)} detail={reports?`Cobrado total: ${money.format(s.paid)} · Original activa: ${money.format(s.original)}`:'Pagos parciales cobrados'} icon={TrendingUp} tone="green"/>
    <StatCard label="Clientes con deuda" value={String(s.customers)} detail="Con saldo pendiente" icon={Users}/>
  </section>
}
export function Debts({customerId}:{customerId?:string}) {
  const {state,upsert}=useFleet()
  const [create,setCreate]=useState(false),[pay,setPay]=useState<ClientDebt|null>(null),[reminder,setReminder]=useState<CalendarEvent|null>(null),[error,setError]=useState('')
  const debts=(state.debts||[]).filter(d=>!customerId||d.customerId===customerId),payments=state.debtPayments||[]
  const saveDebt=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();const f=new FormData(e.currentTarget),id=String(f.get('customerId')),customer=state.customers.find(c=>c.id===id),amount=Number(f.get('amount'))
    if(!customer||!Number.isFinite(amount)||amount<=0){setError('Selecciona un cliente e importe válido.');return}
    const linked=state.rentals.find(r=>r.id===String(f.get('rentalId')))
    if(linked&&linked.customerId!==id){setError('El alquiler seleccionado pertenece a otro cliente.');return}
    const now=new Date().toISOString()
    upsert('debts',{id:uid('debt'),customerId:id,customerName:customer.name,originalAmount:Math.round(amount*100)/100,date:String(f.get('date')),dueDate:String(f.get('dueDate'))||undefined,reason:String(f.get('reason')).trim(),rentalId:String(f.get('rentalId'))||undefined,vehicleId:String(f.get('vehicleId'))||undefined,notes:String(f.get('notes')),createdAt:now,updatedAt:now});setCreate(false)
  }
  const savePayment=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(!pay)return
    const f=new FormData(e.currentTarget),payment={id:uid('debt-payment'),debtId:pay.id,customerId:pay.customerId,amount:Math.round(Number(f.get('amount'))*100)/100,date:String(f.get('date')),method:String(f.get('method')),reference:String(f.get('reference')),notes:String(f.get('notes')),createdAt:new Date().toISOString()}
    try {validateDebtPayment(state,payment);upsert('debtPayments',payment);setPay(null)}catch(err){setError(err instanceof Error?err.message:'No se ha podido registrar el pago.')}
  }
  return <section className="card my-5 p-4 sm:p-5" aria-label="Deudas">
    <div className="flex flex-wrap justify-between gap-3"><h2 className="font-display text-xl font-bold">Deudas</h2><button className="btn-secondary" disabled={!state.customers.length} onClick={()=>{setError('');setCreate(true)}}>Crear deuda</button></div>
    {!debts.length&&<p className="mt-3 text-sm text-stone-500">No hay deudas registradas.</p>}
    <div className="mt-3 space-y-4">{debts.map(d=>{const b=debtBalance(d,payments);return <article key={d.id} className="rounded-xl border border-orange-100 p-4">
      <div className="flex flex-wrap justify-between gap-2"><strong>{state.customers.find(c=>c.id===d.customerId)?.name||d.customerName} · {d.reason}</strong><Badge tone={b.status==='Pagada'?'success':b.status==='Atrasada'?'danger':'warning'}>{b.status}</Badge></div>
      <p className="mt-2 text-sm">Origen: {date(d.date)}{d.dueDate?` · Vence: ${date(d.dueDate)}`:''}</p>
      <dl className="my-3 grid grid-cols-3 gap-2 text-sm"><div><dt>Original</dt><dd className="font-bold">{money.format(d.originalAmount)}</dd></div><div><dt>Pagado</dt><dd className="font-bold text-emerald-700">{money.format(b.paid)}</dd></div><div><dt>Pendiente</dt><dd className={`font-bold ${b.remaining?'text-red-700':'text-emerald-700'}`}>{money.format(b.remaining)}</dd></div></dl>
      {d.notes&&<p className="mb-3 text-sm text-stone-500">{d.notes}</p>}
      <details><summary className="cursor-pointer font-semibold text-brand-600">Historial de pagos ({payments.filter(p=>p.debtId===d.id).length})</summary><ul className="mt-2 space-y-2">{debtPaymentHistory(d,payments).map(p=><li className="rounded-lg bg-brand-50 p-3 text-sm" key={p.id}>{date(p.date)} · {money.format(p.amount)} · {p.method}<br/>Saldo tras el pago: {money.format(p.remaining)}{p.reference&&<p>Referencia: {p.reference}</p>}{p.notes&&<p>{p.notes}</p>}</li>)}</ul></details>
      {!d.cancelled&&b.remaining>0&&<div className="mt-3 flex flex-wrap gap-2"><button className="btn-primary" onClick={()=>{setError('');setPay(d)}}>Registrar pago</button><button className="btn-secondary" onClick={()=>setReminder({id:uid('event'),title:`Recordar cobro · ${d.customerName}`,date:d.dueDate&&d.dueDate>=today()?d.dueDate:today(),time:'09:00',type:'pago',debtId:d.id,customerId:d.customerId,vehicleId:d.vehicleId,rentalId:d.rentalId,status:'active'})}>Crear recordatorio</button><button className="btn-secondary" onClick={()=>{if(confirm('¿Cancelar esta deuda? Se conservarán el importe original y todos sus pagos.'))upsert('debts',{...d,cancelled:true,updatedAt:new Date().toISOString()})}}>Cancelar deuda</button></div>}
    </article>})}</div>
    {create&&<Modal title="Crear deuda" onClose={()=>setCreate(false)}><form onSubmit={saveDebt} className="grid gap-4 sm:grid-cols-2">
      {error&&<p role="alert" className="text-red-700 sm:col-span-2">{error}</p>}
      <label><span className="label">Cliente</span><select name="customerId" className="field" defaultValue={customerId} required>{state.customers.filter(c=>!customerId||c.id===customerId).map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      <Field label="Importe original (€)" name="amount" type="number"/><Field label="Fecha de origen" name="date" type="date" value={today()}/><Field label="Vencimiento (opcional)" name="dueDate" type="date" required={false}/><Field label="Motivo" name="reason"/>
      <label><span className="label">Alquiler (opcional)</span><select name="rentalId" className="field"><option value="">Sin vincular</option>{state.rentals.filter(r=>!customerId||r.customerId===customerId).map(r=><option key={r.id} value={r.id}>{state.customers.find(c=>c.id===r.customerId)?.name} · {r.startDate}</option>)}</select></label>
      <label><span className="label">Vehículo (opcional)</span><select name="vehicleId" className="field"><option value="">Sin vincular</option>{activeVehicles(state).map(v=><option key={v.id} value={v.id}>{v.plate}</option>)}</select></label>
      <label className="sm:col-span-2"><span className="label">Notas</span><textarea name="notes" className="field"/></label><p className="text-sm text-stone-500 sm:col-span-2">Registra aquí deuda adicional. Los cobros de alquiler existentes siguen en Pagos; no vuelvas a registrar el mismo saldo como deuda.</p><div className="sm:col-span-2 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={()=>setCreate(false)}>Cancelar</button><button className="btn-primary">Guardar deuda</button></div>
    </form></Modal>}
    {pay&&<Modal title="Pago de deuda" onClose={()=>setPay(null)}><form onSubmit={savePayment} className="grid gap-4 sm:grid-cols-2"><p className="sm:col-span-2">{pay.customerName} · {pay.reason}<br/>Pendiente: {money.format(debtBalance(pay,payments).remaining)}</p>{error&&<p role="alert" className="sm:col-span-2 text-red-700">{error}</p>}<Field label="Importe pagado (€)" name="amount" type="number" max={debtBalance(pay,payments).remaining}/><Field label="Fecha del pago" name="date" type="date" value={today()}/><label><span className="label">Método de pago</span><select name="method" className="field" required>{['Efectivo','Transferencia','Tarjeta','Bizum','Otro'].map(m=><option key={m}>{m}</option>)}</select></label><Field label="Referencia (opcional)" name="reference" required={false}/><label className="sm:col-span-2"><span className="label">Notas</span><textarea name="notes" className="field"/></label><div className="sm:col-span-2 flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={()=>setPay(null)}>Cancelar</button><button className="btn-primary">Registrar pago</button></div></form></Modal>}
    {reminder&&<ReminderEditor event={reminder} date={reminder.date} onClose={()=>setReminder(null)}/>}
  </section>
}
function Field({label,name,type='text',value,required=true,max}:{label:string;name:string;type?:string;value?:string;required?:boolean;max?:number}){return <label><span className="label">{label}</span><input className="field" name={name} type={type} defaultValue={value} required={required} min={type==='number'?'0.01':undefined} step={type==='number'?'0.01':undefined} max={max}/></label>}

export function DebtPayments() {
 const {state}=useFleet()
 const rows=(state.debts||[]).flatMap(d=>debtPaymentHistory(d,state.debtPayments||[]).map(p=>({...p,customer:d.customerName,reason:d.reason}))).sort((a,b)=>b.date.localeCompare(a.date))
 if(!rows.length)return null
 return <section className="my-5"><h2 className="mb-3 font-display text-xl font-bold">Pagos de deuda</h2><div className="table-shell"><table className="data-table"><thead><tr><th>Fecha</th><th>Cliente / deuda</th><th>Tipo</th><th>Importe pagado</th><th>Saldo restante</th><th>Método</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td>{date(p.date)}</td><td>{p.customer}<span className="block text-sm text-stone-500">{p.reason}</span></td><td><Badge tone="success">Pago de deuda</Badge></td><td>{money.format(p.amount)}</td><td>{money.format(p.remaining)}</td><td>{p.method}</td></tr>)}</tbody></table></div></section>
}
