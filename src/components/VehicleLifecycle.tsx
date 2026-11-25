import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Archive, History, RotateCcw, Trash2 } from 'lucide-react'
import { Badge, Modal } from './ui'
import { MileageHistory } from './MileageHistory'
import { useFleet } from '../store/FleetContext'
import { date, euroWithCents } from '../lib/format'
import { getVehicleMileage } from '../lib/mileage'
import { reactivateVehicle, retireVehicle, retirementBlockers, retirementReasons, validateRetirement, vehicleDeletionPlan, type RetirementInput } from '../lib/vehicleLifecycle'
import { isRetired, snapshotVehicle, vehicleLabel } from '../lib/vehicles'
import { snapshotVehicleExpenses, useExpenses } from '../lib/expenses'
import type { FleetState, Rental, Vehicle, VehicleRetirementReason, VehicleSnapshot } from '../types'

const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }

// "De baja · motivo" for retired vehicles and "Eliminado" for records that only keep a snapshot.
export function VehicleStateBadge({ vehicle, snapshot }: { vehicle?: Vehicle; snapshot?: VehicleSnapshot }) {
  if (isRetired(vehicle)) return <Badge tone="neutral">De baja{vehicle?.baja ? ` · ${retirementReasons[vehicle.baja.motivo]}` : ''}</Badge>
  if (!vehicle && snapshot) return <Badge tone="neutral">Eliminado</Badge>
  return null
}

function useSaveVehicle() {
  const { upsert, upsertConfirmed, remoteEnabled } = useFleet()
  return async (vehicle: Vehicle) => { if (remoteEnabled) await upsertConfirmed('vehicles', vehicle); else upsert('vehicles', vehicle) }
}

function BlockingRentals({ rentals, state, action }: { rentals: Rental[]; state: FleetState; action: string }) {
  return <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
    <p className="font-bold">No se puede {action} este vehículo todavía.</p>
    <p className="mt-1">Tiene alquileres en curso o reservas futuras. Ciérralos o reasígnalos a otro vehículo primero:</p>
    <ul className="mt-3 space-y-2">{rentals.map(rental => <li key={rental.id}><Link className="font-bold text-brand-700 underline" to={`/app/alquileres?edit=${encodeURIComponent(rental.id)}`}>{state.customers.find(customer => customer.id === rental.customerId)?.name || 'Cliente'} · {date(rental.startDate)}{rental.endDate ? ` – ${date(rental.endDate)}` : ' – sin fecha final'} · {rental.status}</Link></li>)}</ul>
  </div>
}

export function RetireVehicleModal({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const { state, ownerId } = useFleet()
  const save = useSaveVehicle()
  const [draft, setDraft] = useState<RetirementInput>({ motivo: 'venta', fecha: localToday(), notas: '' })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const blockers = retirementBlockers(state, vehicle.id)
  const set = (patch: Partial<RetirementInput>) => setDraft(current => ({ ...current, ...patch }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const problem = validateRetirement(draft)
    if (problem) { setError(problem); return }
    setBusy(true); setError('')
    try { await save(retireVehicle(state, vehicle, draft, ownerId)); onClose() }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'No se ha podido dar de baja el vehículo.') }
    finally { setBusy(false) }
  }
  return <Modal title={`Dar de baja · ${vehicle.plate}`} onClose={() => { if (!busy) onClose() }}>
    {blockers.length ? <div className="grid gap-4"><BlockingRentals rentals={blockers} state={state} action="dar de baja"/><div className="flex justify-end"><button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button></div></div>
      : <form onSubmit={event => void submit(event)} className="grid gap-4 sm:grid-cols-2">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 sm:col-span-2">{error}</p>}
        <label><span className="label">Motivo *</span><select className="field" value={draft.motivo} onChange={e => set({ motivo: e.target.value as VehicleRetirementReason })}>{Object.entries(retirementReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="label">Fecha de baja *</span><input className="field" type="date" required max={localToday()} value={draft.fecha} onChange={e => set({ fecha: e.target.value })}/></label>
        {draft.motivo === 'venta' && <>
          <label><span className="label">Precio de venta (€)</span><input className="field" type="number" min="0" step="0.01" value={draft.precioVenta ?? ''} onChange={e => set({ precioVenta: e.target.value === '' ? undefined : Number(e.target.value) })}/></label>
          <label><span className="label">Comprador</span><input className="field" maxLength={200} value={draft.comprador || ''} onChange={e => set({ comprador: e.target.value })}/></label>
        </>}
        {draft.motivo === 'siniestro_total' && <>
          <label><span className="label">Nº de siniestro</span><input className="field" maxLength={100} value={draft.numeroSiniestro || ''} onChange={e => set({ numeroSiniestro: e.target.value })}/></label>
          <label><span className="label">Aseguradora</span><input className="field" maxLength={200} value={draft.aseguradora || ''} onChange={e => set({ aseguradora: e.target.value })}/></label>
        </>}
        <label className="sm:col-span-2"><span className="label">Notas{draft.motivo === 'otro' ? ' *' : ''}</span><textarea className="field min-h-24" maxLength={2000} required={draft.motivo === 'otro'} value={draft.notas} onChange={e => set({ notas: e.target.value })}/></label>
        <p className="rounded-xl border border-orange-100 bg-brand-50 p-3 text-sm text-stone-700 sm:col-span-2"><strong>{vehicleLabel(vehicle)} · {vehicle.plate}</strong> dejará de aparecer en la flota, pero se conservará su historial. Podrás reactivarlo desde Flota › Archivados.</p>
        <div className="flex gap-3 sm:col-span-2 sm:justify-end"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn-danger" disabled={busy}><Archive size={18}/>{busy ? 'Guardando…' : 'Dar de baja'}</button></div>
      </form>}
  </Modal>
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wider text-stone-500">{label}</dt><dd className="mt-1 text-sm text-ink">{children}</dd></div>
}

// Read-only sheet of an archived vehicle: retirement data, state history and "Reactivar".
export function ArchivedVehicleModal({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const { state, ownerId } = useFleet()
  const save = useSaveVehicle()
  const [confirming, setConfirming] = useState(false), [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const baja = vehicle.baja
  const history = [...(vehicle.estadoHistorial || [])].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const rentals = getVehicleMileage(state, vehicle.id).rentals
  const reactivate = async () => {
    setBusy(true); setError('')
    try { await save(reactivateVehicle(vehicle, notes, ownerId)); onClose() }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'No se ha podido reactivar el vehículo.') }
    finally { setBusy(false) }
  }
  return <Modal title={`${vehicleLabel(vehicle)} · ${vehicle.plate}`} onClose={() => { if (!busy) onClose() }}>
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2"><VehicleStateBadge vehicle={vehicle}/><span className="text-sm text-stone-500">Ficha de solo lectura</span></div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <dl className="grid gap-4 sm:grid-cols-3">
        <Detail label="Tipo">{vehicle.category} · {vehicle.year}</Detail>
        <Detail label="Motivo">{baja ? retirementReasons[baja.motivo] : '—'}</Detail>
        <Detail label="Fecha de baja">{date(baja?.fecha)}</Detail>
        {baja?.precioVenta !== undefined && <Detail label="Precio de venta">{euroWithCents.format(baja.precioVenta)}</Detail>}
        {baja?.comprador && <Detail label="Comprador">{baja.comprador}</Detail>}
        {baja?.numeroSiniestro && <Detail label="Nº de siniestro">{baja.numeroSiniestro}</Detail>}
        {baja?.aseguradora && <Detail label="Aseguradora">{baja.aseguradora}</Detail>}
        {baja?.registradaAt && <Detail label="Registrada">{new Date(baja.registradaAt).toLocaleString('es-ES')}</Detail>}
        {baja?.notas && <div className="sm:col-span-3"><Detail label="Notas">{baja.notas}</Detail></div>}
      </dl>
      <section aria-label="Historial de estados" className="rounded-xl border border-orange-100 p-4">
        <h3 className="flex items-center gap-2 font-bold"><History size={18}/> Historial de estados</h3>
        {history.length ? <ol className="mt-3 divide-y divide-orange-100 text-sm">{history.map(change => <li key={change.id} className="py-2">
          <p className="font-semibold">{change.estadoNuevo === 'baja' ? 'Baja' : 'Reactivación'}{change.motivo ? ` · ${retirementReasons[change.motivo]}` : ''}</p>
          <p className="text-xs text-stone-500">{new Date(change.fecha).toLocaleString('es-ES')}{change.fechaBaja ? ` · con fecha ${date(change.fechaBaja)}` : ''}{change.notas ? ` · ${change.notas}` : ''}</p>
        </li>)}</ol> : <p className="mt-2 text-sm text-stone-500">Sin cambios registrados.</p>}
      </section>
      <MileageHistory rentals={rentals} state={state}/>
      <Link className="text-sm font-bold text-brand-600" to={`/app/documentacion?vehicle=${encodeURIComponent(vehicle.id)}`} onClick={onClose}>Ver documentación, impuestos y multas</Link>
      {confirming ? <div className="grid gap-3 rounded-xl border border-orange-200 bg-brand-50 p-4">
        <p className="text-sm font-semibold text-ink">El vehículo volverá a la flota activa y aparecerá en el dashboard y en los selectores de alquiler.</p>
        <label><span className="label">Notas (opcional)</span><textarea className="field min-h-20" maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)}/></label>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button><button type="button" className="btn-primary" disabled={busy} onClick={() => void reactivate()}><RotateCcw size={18}/>{busy ? 'Guardando…' : 'Confirmar reactivación'}</button></div>
      </div> : <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={onClose}>Cerrar</button><button type="button" className="btn-primary" onClick={() => setConfirming(true)}><RotateCcw size={18}/> Reactivar vehículo</button></div>}
    </div>
  </Modal>
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function DeleteVehicleModal({ vehicle, onClose, onArchive }: { vehicle: Vehicle; onClose: () => void; onArchive?: () => void }) {
  const { state, remove, ownerId, remoteEnabled } = useFleet()
  const { expenses } = useExpenses(ownerId)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const plan = vehicleDeletionPlan(state, vehicle.id)
  const blockers = retirementBlockers(state, vehicle.id)
  const linkedExpenses = remoteEnabled ? expenses.filter(expense => expense.vehicleId === vehicle.id).length : 0
  const removed = [
    plural(plan.removed.maintenance.length, 'mantenimiento', 'mantenimientos'),
    plural(plan.removed.documents.length, 'documento / ITV', 'documentos / ITV'),
    plural(plan.removed.taxes.length, 'impuesto', 'impuestos'),
    plural(plan.removed.events.length, 'recordatorio del vehículo, mantenimiento o documento', 'recordatorios del vehículo, mantenimientos o documentos'),
    plural(plan.removed.fines.length, 'multa sin alquiler vinculado', 'multas sin alquiler vinculado'),
    'Kilometraje actual, tarifas, foto y notas del vehículo',
  ]
  const kept = [
    plural(plan.kept.rentals.length, 'alquiler', 'alquileres'),
    plural(plan.kept.payments.length, 'pago de esos alquileres', 'pagos de esos alquileres'),
    plural(plan.kept.fines.length, 'multa vinculada a un alquiler', 'multas vinculadas a un alquiler'),
    plural(plan.kept.events.length, 'recordatorio vinculado a un alquiler', 'recordatorios vinculados a un alquiler'),
    ...(remoteEnabled ? [plural(linkedExpenses, 'gasto', 'gastos')] : []),
    ...(plan.kept.debts.length ? [plural(plan.kept.debts.length, 'deuda de cliente', 'deudas de clientes')] : []),
    'Clientes',
  ]
  const confirm = async () => {
    setBusy(true); setError('')
    try {
      if (remoteEnabled) await snapshotVehicleExpenses(vehicle.id, snapshotVehicle(vehicle))
      remove('vehicles', vehicle.id)
      onClose()
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'No se ha podido eliminar el vehículo.') }
    finally { setBusy(false) }
  }
  return <Modal title={`Eliminar ${vehicle.plate}`} onClose={() => { if (!busy) onClose() }}>
    <div className="confirm-dialog grid gap-4">
      {blockers.length ? <BlockingRentals rentals={blockers} state={state} action="eliminar"/> : <>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        {!isRetired(vehicle) && onArchive && <div className="rounded-xl border border-orange-200 bg-brand-50 p-4 text-sm text-stone-700">
          <p className="font-bold text-ink">Recomendado: archivar en su lugar</p>
          <p className="mt-1">Si el vehículo ya no está disponible (venta, siniestro, fin de renting…), dalo de baja: desaparece de la flota y conserva todo su historial. Se puede deshacer.</p>
        </div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-red-200 p-4"><h3 className="flex items-center gap-2 font-bold text-red-700"><Trash2 size={17}/> Se borra</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">{removed.map(item => <li key={item}>{item}</li>)}</ul></section>
          <section className="rounded-xl border border-emerald-200 p-4"><h3 className="font-bold text-emerald-700">Se conserva</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">{kept.map(item => <li key={item}>{item}</li>)}</ul><p className="mt-2 text-xs text-stone-500">Mostrarán la matrícula y el modelo guardados al eliminarlo.</p></section>
        </div>
        <p className="text-sm font-semibold text-red-700">El vehículo y los registros de la columna «Se borra» no se pueden recuperar.</p>
      </>}
      <div className="confirm-actions flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        {!blockers.length && <>
          <button type="button" className="btn-danger" disabled={busy} onClick={() => void confirm()}><Trash2 size={18}/>{busy ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
          {!isRetired(vehicle) && onArchive && <button type="button" className="btn-primary" disabled={busy} onClick={onArchive}><Archive size={18}/> Archivar en su lugar</button>}
        </>}
      </div>
    </div>
  </Modal>
}
