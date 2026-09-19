import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useFleet } from '../store/FleetContext'
import { dateInZone, offsetLabel, reminderCategories, reminderDetails, upcomingReminders } from '../lib/reminders'
import { getSystemAlerts } from '../lib/alerts'
export function UpcomingReminders({compact=false}:{compact?:boolean}) {
  const {state}=useFleet()
  const items=useMemo(()=>upcomingReminders(state),[state])
  const today=dateInZone(new Date(),state.adminSettings.notifications?.timezone)
  const relative=(day:string)=>Math.round((Date.parse(day)-Date.parse(today))/86400000)
  const groups=['Hoy','Mañana','Esta semana','Próximamente']
  const groupFor=(day:string)=>{const days=relative(day);return days===0?0:days===1?1:days<7?2:3}
  const system=getSystemAlerts(state)
  const nextCounts=[['Pagos',system.filter(a=>a.paymentId).length],['ITV',system.filter(a=>a.id.startsWith('document-')&&a.title.toLowerCase().includes('itv')).length],['Mantenimiento',system.filter(a=>a.id.startsWith('maintenance-')).length]]
  return <section className="card mb-5 mt-5 p-5" aria-label="Próximas alertas"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-bold">Próximas alertas</h2><Link className="text-sm font-bold text-brand-600" to="/app/calendario">Abrir calendario</Link></div>
    {compact&&<><div className="my-3 flex flex-wrap gap-4 text-sm"><span>Hoy: <strong>{items.filter(i=>i.date===today).length}</strong></span><span>Mañana: <strong>{items.filter(i=>relative(i.date)===1).length}</strong></span><span>Importantes: <strong>{items.filter(i=>i.event.priority==='alta').length}</strong></span></div><div className="mb-3 flex flex-wrap gap-3 text-xs text-stone-500">{nextCounts.map(([label,count])=><Link key={label} to="/app/alertas">{label}: {count} avisos</Link>)}</div></>}
    {!items.length&&<p className="mt-3 text-sm text-stone-500">No hay recordatorios configurados para los próximos 90 días.</p>}
    {groups.map((label,index)=>{
      const group=(compact?items.slice(0,3):items).filter(o=>groupFor(o.date)===index)
      if(!group.length)return null
      return <div key={label} className="mt-4"><h3 className="text-sm font-bold text-stone-500">{label}</h3><div className="mt-2 space-y-2">{group.map(o=><Link key={o.key} className="block rounded-xl border border-orange-100 p-3" to={`/app/calendario?reminder=${encodeURIComponent(o.event.id)}&date=${o.date}`}><div className="flex flex-wrap justify-between gap-2"><strong>{o.event.priority==='alta'?'⚑ ':''}{o.event.title}</strong><span className="text-sm">{o.date.split('-').reverse().join('/')} · {o.time}</span></div><p className="mt-1 text-sm text-stone-500">{reminderCategories[o.event.type]} · Activa · {o.event.timezone}</p>{!compact&&<><p className="mt-1 text-sm">{reminderDetails(o.event,state)}</p><p className="mt-1 text-xs text-stone-500">{o.event.reminders?.map(offsetLabel).join(' / ')}</p></>}</Link>)}</div></div>
    })}
  </section>
}
