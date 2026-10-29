import { useState, type FormEvent } from 'react'
import { useFleet } from '../store/FleetContext'
import { expenseCategories, procedureTypes, saveExpense, travelTypes, type Expense, type ExpenseCategory, type ProcedureType, type TravelType } from '../lib/expenses'
import { validatePrivateFile } from '../lib/privateFiles'
import { vehicleLabel } from '../lib/vehicles'
import { PrivateFileView } from './PrivateFileView'
import { Modal } from './ui'

const numberOrUndefined = (value: string) => value.trim() === '' ? undefined : Number(value.replace(',', '.'))

export function ExpenseEditor({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const { state } = useFleet()
  const [draft, setDraft] = useState<Expense>(expense)
  const [linked, setLinked] = useState(Boolean(expense.vehicleId))
  const [file, setFile] = useState<File | null>(null)
  const [removeAttachment, setRemoveAttachment] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const set = (patch: Partial<Expense>) => setDraft(current => ({ ...current, ...patch }))
  const isNew = !expense.createdAt
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (linked && !draft.vehicleId) { setError('Selecciona el vehículo o desactiva «Vincular a vehículo».'); return }
    setBusy(true); setError('')
    try {
      await saveExpense({ ...draft, vehicleId: linked ? draft.vehicleId : undefined }, { file, removeAttachment })
      onClose()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'No se ha podido guardar el gasto.')
    } finally { setBusy(false) }
  }
  const chooseFile = (selected?: File) => {
    if (!selected) { setFile(null); return }
    try { validatePrivateFile(selected); setFile(selected); setError('') } catch (problem) { setFile(null); setError(problem instanceof Error ? problem.message : 'Archivo no válido.') }
  }
  const attachment = !removeAttachment ? draft.attachment : undefined
  return <Modal title={isNew ? 'Añadir gasto' : 'Editar gasto'} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={event => void save(event)} className="grid gap-4 sm:grid-cols-2">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 sm:col-span-2">{error}</p>}
      <label><span className="label">Fecha *</span><input className="field" type="date" required value={draft.date} onChange={e => set({ date: e.target.value })}/></label>
      <label><span className="label">Importe (€) *</span><input className="field" type="number" min="0.01" step="0.01" required value={Number.isFinite(draft.amount) ? draft.amount : ''} onChange={e => set({ amount: e.target.value === '' ? Number.NaN : Number(e.target.value) })}/></label>
      <label className="sm:col-span-2"><span className="label">Categoría *</span><select className="field" value={draft.category} onChange={e => set({ category: e.target.value as ExpenseCategory })}>{Object.entries(expenseCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {draft.category === 'combustible' && <>
        <label><span className="label">Litros (opcional)</span><input className="field" type="number" min="0" step="0.01" value={draft.liters ?? ''} onChange={e => set({ liters: numberOrUndefined(e.target.value) })}/></label>
        <label><span className="label">Km del vehículo (opcional)</span><input className="field" type="number" min="0" step="1" value={draft.odometerKm ?? ''} onChange={e => set({ odometerKm: numberOrUndefined(e.target.value) })}/></label>
      </>}
      {draft.category === 'desplazamientos' && <label className="sm:col-span-2"><span className="label">Tipo de desplazamiento</span><select className="field" value={draft.travelType || ''} onChange={e => set({ travelType: (e.target.value || undefined) as TravelType | undefined })}><option value="">Sin especificar</option>{Object.entries(travelTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      {draft.category === 'tramites' && <label className="sm:col-span-2"><span className="label">Tipo de trámite</span><select className="field" value={draft.procedureType || ''} onChange={e => set({ procedureType: (e.target.value || undefined) as ProcedureType | undefined })}><option value="">Sin especificar</option>{Object.entries(procedureTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <label className="sm:col-span-2"><span className="label">Descripción</span><textarea className="field min-h-20" maxLength={2000} value={draft.description} onChange={e => set({ description: e.target.value })}/></label>
      <label className="sm:col-span-2"><span className="label">Proveedor (opcional)</span><input className="field" maxLength={200} value={draft.supplier || ''} onChange={e => set({ supplier: e.target.value })}/></label>
      <div className="space-y-3 rounded-xl border border-orange-100 p-4 sm:col-span-2">
        <label className="flex items-center gap-3"><input type="checkbox" checked={linked} onChange={e => setLinked(e.target.checked)}/><span className="font-semibold">Vincular a vehículo</span></label>
        {linked ? <label className="block"><span className="label">Vehículo *</span><select className="field" value={draft.vehicleId || ''} onChange={e => set({ vehicleId: e.target.value || undefined })}><option value="">Selecciona un vehículo</option>{state.vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicleLabel(vehicle)}</option>)}</select></label>
          : <p className="text-sm text-stone-500">Se guardará como gasto genérico de la flota.</p>}
      </div>
      <div className="sm:col-span-2"><span className="label">Ticket o factura (opcional)</span>
        {attachment && !file ? <PrivateFileView file={attachment} target="expense" onRemove={() => setRemoveAttachment(true)}/>
          : <><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} className="block max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:font-bold file:text-white" onChange={e => chooseFile(e.target.files?.[0])}/><span className="mt-2 block text-xs text-stone-500">PDF, JPG, PNG o WebP. Máximo 10 MB.</span></>}
      </div>
      <div className="flex gap-3 sm:col-span-2 sm:justify-end"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar gasto'}</button></div>
    </form>
  </Modal>
}
