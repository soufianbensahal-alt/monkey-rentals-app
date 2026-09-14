import { Link } from 'react-router-dom'
import type { FleetState, Rental } from '../types'
import { calculateMileage } from '../lib/mileage'
import { date, euroWithCents as euro } from '../lib/format'
import { vehicleLabel } from '../lib/vehicles'

export function MileageHistory({ rentals, state }: { rentals: Rental[]; state: FleetState }) {
  return <details className="mt-4 rounded-xl border border-orange-100 p-3 text-sm"><summary className="cursor-pointer font-bold">Historial de alquileres y kilómetros ({rentals.length})</summary>
    <div className="mt-3 grid gap-3">{[...rentals].sort((a, b) => b.startDate.localeCompare(a.startDate)).map(r => {
      const calc = calculateMileage(r, state.vehicles.find(v => v.id === r.vehicleId))
      const paid = state.payments.filter(p => p.rentalId === r.id && p.type === 'km_extra' && p.status === 'pagado').reduce((n, p) => n + p.amount, 0)
      return <div key={r.id} className="border-t border-orange-100 pt-3"><Link className="font-bold text-brand-600" to={`/app/alquileres?edit=${encodeURIComponent(r.id)}`}>{vehicleLabel(state.vehicles.find(v => v.id === r.vehicleId))} · {state.customers.find(c => c.id === r.customerId)?.name}</Link><p className="mt-1 text-stone-500">{date(r.startDate)} — {r.endDate ? date(r.endDate) : 'Sin fecha final'} · {r.status}</p><p className="mt-1">Km realizados: {calc.used?.toLocaleString('es-ES') ?? 'Sin completar'} · Km extra: {calc.extra?.toLocaleString('es-ES') ?? 'No calculados'}</p><p>Cobrado por km extra: {euro.format(paid)}</p></div>
    })}{!rentals.length && <p className="text-stone-500">Sin alquileres registrados.</p>}</div>
  </details>
}
