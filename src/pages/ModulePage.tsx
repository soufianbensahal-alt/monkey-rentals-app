import { useState, type FormEvent } from 'react'
import { AlertTriangle, CalendarDays, RotateCcw, Settings, ShieldCheck, Wrench } from 'lucide-react'
import { Badge, EmptyState, PageHeader, StatCard } from '../components/ui'
import { useFleet } from '../store/FleetContext'
import { date, euro, shortDate } from '../lib/format'
import { vehicleLabel } from '../lib/vehicles'
import { getSystemAlerts } from '../lib/alerts'
import { ThemeSelector } from '../components/ThemeSelector'
import ReportsPage from './ReportsPage'

type ModuleType='calendar'|'maintenance'|'alerts'|'reports'|'settings'
export default function ModulePage({type}:{type:ModuleType}){if(type==='calendar')return <Calendar/>;if(type==='maintenance')return <Maintenance/>;if(type==='alerts')return <Alerts/>;if(type==='reports')return <ReportsPage/>;return <><SettingsPage/><ThemeSelector/></>}

function Calendar(){const {state}=useFleet();const sorted=[...state.events].sort((a,b)=>a.date.localeCompare(b.date));const grouped=sorted.reduce<Record<string,typeof sorted>>((acc,e)=>{(acc[e.date]??=[]).push(e);return acc},{});return <div className="fade-up"><PageHeader eyebrow="Planificación" title="Calendario" description="Entregas, devoluciones, ITV y taller en una única agenda."/><section className="card p-5"><h2 className="font-display text-xl font-bold">Próximos eventos</h2>{sorted.length?<div className="mt-5 space-y-5">{Object.entries(grouped).map(([day,events])=><div key={day} className="grid gap-3 sm:grid-cols-[100px_1fr]"><div><p className="font-bold text-brand-700">{shortDate(day)}</p><p className="text-xs text-stone-500">{events.length} eventos</p></div><div className="space-y-2">{events.map(e=><div className="rounded-xl border-l-4 border-brand-500 bg-brand-50 p-3" key={e.id}><p className="font-semibold">{e.title}</p><p className="mt-1 text-xs capitalize text-stone-500">{e.type}</p></div>)}</div></div>)}</div>:<EmptyState title="No hay eventos programados." description="Los próximos alquileres, ITV y mantenimientos aparecerán aquí."/>}</section></div>}

function Maintenance(){const {state}=useFleet();return <div className="fade-up"><PageHeader eyebrow="Cuidado de flota" title="Mantenimiento" description="Controla las intervenciones y la inmovilización de vehículos."/><div className="grid gap-4 sm:grid-cols-3"><StatCard label="En taller" value={String(state.maintenance.filter(x=>x.status==='en curso').length)} detail="Intervenciones activas" icon={Wrench} tone="red"/><StatCard label="Programados" value={String(state.maintenance.filter(x=>x.status==='programado').length)} detail="Próximas intervenciones" icon={CalendarDays}/><StatCard label="Coste acumulado" value={euro.format(state.maintenance.reduce((s,x)=>s+x.cost,0))} detail="Mantenimiento registrado" icon={Wrench} tone="blue"/></div><div className="table-shell mt-5">{state.maintenance.length?<table className="data-table"><thead><tr><th>Vehículo</th><th>Intervención</th><th>Fecha</th><th>Estado</th><th>Coste</th></tr></thead><tbody>{state.maintenance.map(m=>{const v=state.vehicles.find(x=>x.id===m.vehicleId);return <tr key={m.id}><td className="font-bold text-ink">{vehicleLabel(v)}<span className="block text-xs font-normal text-stone-500">{v?.plate}</span></td><td>{m.type}<span className="block text-xs text-stone-500">{m.notes}</span></td><td>{date(m.date)}</td><td><Badge tone={m.status==='completado'?'success':m.status==='en curso'?'danger':'warning'}>{m.status}</Badge></td><td className="font-bold">{euro.format(m.cost)}</td></tr>})}</tbody></table>:<EmptyState title="No hay mantenimientos registrados." description="Añádelos desde ITV y documentación para recibir recordatorios."/>}</div></div>}

function Alerts(){const {state,markPaymentPaid}=useFleet();const alerts=getSystemAlerts(state);return <div className="fade-up"><PageHeader eyebrow="Centro de atención" title="Alertas" description="Cobros, ITV, documentos, impuestos y mantenimientos que requieren atención."/><div className="grid gap-3">{alerts.length?alerts.map(alert=><article key={alert.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><span className={`grid size-11 shrink-0 place-items-center rounded-xl ${alert.severity==='danger'?'bg-red-50 text-red-700':alert.severity==='info'?'bg-blue-50 text-blue-700':'bg-amber-50 text-amber-700'}`}><AlertTriangle size={20}/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-ink">{alert.title}</h2><Badge tone={alert.severity}>{alert.severity==='danger'?'urgente':alert.severity==='warning'?'próximo':'programado'}</Badge></div><p className="mt-1 text-sm text-stone-500">{alert.detail} · {date(alert.date)}</p></div>{alert.paymentId&&<button className="btn-primary" onClick={()=>markPaymentPaid(alert.paymentId!)}>Marcar como pagado</button>}</article>):<div className="card"><EmptyState title="No hay alertas activas." description="Los próximos cobros y vencimientos aparecerán aquí."/></div>}</div></div>}

function SettingsPage(){
  const {state,updateSettings,reset,remoteEnabled,rememberSession,setRememberSession}=useFleet()
  const [saved,setSaved]=useState(false)
  const save=(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault()
    const f=new FormData(e.currentTarget)
    updateSettings({name:String(f.get('name')).trim()||'Jonathan',company:String(f.get('company')).trim()||'Monkey Rentals',email:String(f.get('email')).trim(),phone:String(f.get('phone')).trim()})
    setSaved(true)
  }
  const toggleRemember=(enabled:boolean)=>{
    if (!enabled && !confirm('Se cerrará la sesión en este dispositivo. Tus datos remotos no se borrarán. ¿Continuar?')) return
    setRememberSession(enabled)
  }
  return <div className="fade-up">
    <PageHeader eyebrow="Preferencias" title="Configuración" description="Datos del administrador, seguridad del dispositivo y almacenamiento local."/>
    <div className="grid gap-5 lg:grid-cols-[1fr_.7fr]">
      <section className="card p-6">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Settings/></span><div><h2 className="font-display text-xl font-bold">Administrador</h2><p className="text-sm text-stone-500">Información mostrada en el dashboard</p></div></div>
        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={save}><label><span className="label">Nombre</span><input name="name" className="field" defaultValue={state.adminSettings.name} required/></label><label><span className="label">Empresa</span><input name="company" className="field" defaultValue={state.adminSettings.company} required/></label><label><span className="label">Email</span><input name="email" type="email" className="field" defaultValue={state.adminSettings.email}/></label><label><span className="label">Teléfono</span><input name="phone" type="tel" className="field" defaultValue={state.adminSettings.phone}/></label>{saved&&<p className="text-sm font-semibold text-emerald-700 sm:col-span-2">Cambios guardados correctamente.</p>}<button className="btn-primary sm:col-span-2 sm:justify-self-end">Guardar cambios</button></form>
      </section>
      <div className="grid gap-5">
        <section className="card p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600"><ShieldCheck size={20}/></span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-bold">Seguridad del dispositivo</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">Controla si Monkey Rentals recuerda la sesión en este navegador.</p>
            </div>
          </div>
          {remoteEnabled ? <label className="settings-toggle mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border p-4">
            <span><span className="block font-bold text-ink">Mantener sesión abierta</span><span className="mt-1 block text-xs leading-5 text-stone-500">Al desactivarlo se cerrará la sesión local. No borra datos de Supabase.</span></span>
            <input className="sr-only" type="checkbox" checked={rememberSession} onChange={event=>toggleRemember(event.target.checked)}/>
            <span className="login-switch shrink-0" aria-hidden="true"><span/></span>
          </label> : <p className="mt-5 rounded-2xl bg-brand-50 p-4 text-sm font-semibold text-stone-600">La sincronización remota no está configurada en este entorno.</p>}
        </section>
        <section className="card p-6">
          <h2 className="font-display text-xl font-bold">Almacenamiento local</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">Vehículos, clientes, alquileres y pagos se guardan en este navegador. Al borrar los datos, la app volverá a estar vacía.</p>
          <button className="btn-secondary mt-6 w-full" onClick={()=>{if(confirm('Se eliminarán todos los datos guardados. ¿Continuar?'))reset()}}><RotateCcw size={18}/> Borrar todos los datos</button>
        </section>
      </div>
    </div>
  </div>
}
