import { useState } from 'react'
import { useFleet } from '../store/FleetContext'
import { Link } from 'react-router-dom'
import type { FleetState } from '../types'
import { getVehicleMileage, mileageReport, hasMileageAlert } from '../lib/mileage'
import { date, euroWithCents as euro } from '../lib/format'
import { vehicleLabel } from '../lib/vehicles'
import { Modal } from './ui'

export function MileageOverview({ state, compact = false }: { state: FleetState; compact?: boolean }) {
  const { dismissMileageAlert } = useFleet()
  const [reviewing, setReviewing] = useState(false)
  const report = mileageReport(state)
  const pending = report.missing.filter(hasMileageAlert)
  const dismissed = report.missing.length - pending.length
  const pendingLabel = (r: FleetState['rentals'][number]) => `${vehicleLabel(state.vehicles.find(v => v.id === r.vehicleId))} · ${state.customers.find(c => c.id === r.customerId)?.name || 'Cliente'}`
  const mostUsed = state.vehicles.map(v => ({ vehicle: v, km: getVehicleMileage(state, v.id).totalUsed })).sort((a, b) => b.km - a.km)[0]
  if (!state.rentals.some(r => r.kmStart !== undefined || r.kmEnd !== undefined || r.kmExtraEnabled) && !report.missing.length && !state.payments.some(p => p.type === 'km_extra')) return null
  return <section className="card mt-5 p-5 sm:p-6" aria-label="Resumen de kilometraje">
    <h2 className="font-display text-xl font-bold">Kilometraje y cargos extra</h2>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Ingresos por km extra del mes" value={euro.format(report.monthIncome)}/>
      <Metric label="Km extra pendientes de cobro" value={euro.format(report.pending)}/>
      <Metric label="Ingresos por km extra acumulados" value={euro.format(report.totalPaid)}/>
      <Metric label="Alquileres sin km finales" value={String(report.missing.length)}/>
    </div>
    {compact && pending.length > 0 && <div className="mt-4 flex flex-wrap gap-3">{pending.slice(0, 3).map(r => <div key={r.id} className="flex flex-wrap items-center gap-2"><Link className="text-sm font-bold text-brand-600" to={editUrl(r.id)}>Completar km · {vehicleLabel(state.vehicles.find(v => v.id === r.vehicleId))} · {state.customers.find(c => c.id === r.customerId)?.name}</Link><DismissButton label={pendingLabel(r)} onClick={()=>dismissMileageAlert(r.id)}/></div>)}</div>}
    {!compact && pending.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-3"><p className="text-sm font-bold text-brand-600">{pending.length} {pending.length === 1 ? 'alquiler pendiente' : 'alquileres pendientes'} de completar km</p><button type="button" className="btn-secondary min-h-10 px-3 text-xs" onClick={() => setReviewing(true)}>Revisar</button></div>}
    {reviewing && pending.length > 0 && <Modal title="Alquileres pendientes de completar km" onClose={() => setReviewing(false)}>
      <ul className="divide-y divide-orange-100">{pending.map(r => <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="font-bold">{vehicleLabel(state.vehicles.find(v => v.id === r.vehicleId))}</p><p className="text-sm text-stone-500">{state.customers.find(c => c.id === r.customerId)?.name || 'Cliente'}{r.endDate || r.startDate ? ` · ${date(r.endDate || r.startDate)}` : ''}</p></div>
        <div className="flex gap-2"><Link className="btn-primary min-h-10 px-3 text-xs" to={editUrl(r.id)}>Completar km</Link><DismissButton label={pendingLabel(r)} onClick={()=>dismissMileageAlert(r.id)}/></div>
      </li>)}</ul>
    </Modal>}
    {dismissed > 0 && <p className="mt-3 text-sm text-stone-500">{dismissed} {dismissed === 1 ? 'aviso descartado' : 'avisos descartados'}. Los alquileres siguen sin km finales. Puedes reactivar el aviso al editar el alquiler.</p>}
    <p className="mt-4 text-sm text-stone-500">Vehículo con más uso: {mostUsed?.km ? `${vehicleLabel(mostUsed.vehicle)} · ${mostUsed.km.toLocaleString('es-ES')} km` : 'Sin lecturas completas'}</p>
    {!compact && <>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><p>Vehículo con más km extra: <strong>{report.topVehicleId ? vehicleLabel(state.vehicles.find(v => v.id === report.topVehicleId)) : 'Sin excesos'}</strong></p><p>Cliente con más km extra: <strong>{state.customers.find(c => c.id === report.topCustomerId)?.name || 'Sin excesos'}</strong></p></div>
      {report.monthly.length > 0 && <div className="mt-4 overflow-x-auto"><table className="data-table"><thead><tr><th>Mes de cobro</th><th>Km extra cobrados</th><th>Ingresos por km extra</th></tr></thead><tbody>{report.monthly.map(m => <tr key={m.month}><td>{m.month.slice(5)}/{m.month.slice(0, 4)}</td><td>{m.km.toLocaleString('es-ES')} km</td><td>{euro.format(m.income)}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-stone-500">Los pagos antiguos sin detalle de kilómetros aportan su importe; no se estima su distancia. Estos ingresos ya están incluidos en el beneficio de Informes.</p></div>}
    </>}
  </section>
}
const editUrl = (rentalId: string) => `/app/alquileres?edit=${encodeURIComponent(rentalId)}`
function DismissButton({ label, onClick }: { label: string; onClick: () => void }) { return <button type="button" className="btn-secondary min-h-10 px-3 text-xs" onClick={onClick} aria-label={`Descartar aviso de kilometraje de ${label}`}>Descartar</button> }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-brand-50 p-3"><p className="text-xs text-stone-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div> }
