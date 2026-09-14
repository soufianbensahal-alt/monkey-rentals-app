import { Link } from 'react-router-dom'
import type { FleetState } from '../types'
import { getVehicleMileage, mileageReport } from '../lib/mileage'
import { euroWithCents as euro } from '../lib/format'
import { vehicleLabel } from '../lib/vehicles'

export function MileageOverview({ state, compact = false }: { state: FleetState; compact?: boolean }) {
  const report = mileageReport(state)
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
    {report.missing.length > 0 && <div className="mt-4 flex flex-wrap gap-3">{report.missing.slice(0, compact ? 3 : undefined).map(r => <Link key={r.id} className="text-sm font-bold text-brand-600" to={`/app/alquileres?edit=${encodeURIComponent(r.id)}`}>Completar km · {vehicleLabel(state.vehicles.find(v => v.id === r.vehicleId))} · {state.customers.find(c => c.id === r.customerId)?.name}</Link>)}</div>}
    <p className="mt-4 text-sm text-stone-500">Vehículo con más uso: {mostUsed?.km ? `${vehicleLabel(mostUsed.vehicle)} · ${mostUsed.km.toLocaleString('es-ES')} km` : 'Sin lecturas completas'}</p>
    {!compact && <>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><p>Vehículo con más km extra: <strong>{report.topVehicleId ? vehicleLabel(state.vehicles.find(v => v.id === report.topVehicleId)) : 'Sin excesos'}</strong></p><p>Cliente con más km extra: <strong>{state.customers.find(c => c.id === report.topCustomerId)?.name || 'Sin excesos'}</strong></p></div>
      {report.monthly.length > 0 && <div className="mt-4 overflow-x-auto"><table className="data-table"><thead><tr><th>Mes de cobro</th><th>Km extra cobrados</th><th>Ingresos por km extra</th></tr></thead><tbody>{report.monthly.map(m => <tr key={m.month}><td>{m.month.slice(5)}/{m.month.slice(0, 4)}</td><td>{m.km.toLocaleString('es-ES')} km</td><td>{euro.format(m.income)}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-stone-500">Los pagos antiguos sin detalle de kilómetros aportan su importe; no se estima su distancia. Estos ingresos ya están incluidos en el beneficio de Informes.</p></div>}
    </>}
  </section>
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-brand-50 p-3"><p className="text-xs text-stone-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div> }
