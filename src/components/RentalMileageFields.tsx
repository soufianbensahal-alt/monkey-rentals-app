import type { RentalMileage, Vehicle } from '../types'
import { calculateMileage } from '../lib/mileage'
import { euroWithCents as euro } from '../lib/format'

export function RentalMileageFields({ value, onChange, vehicle, days, finalized, createCharge, onCreateCharge, existingCharge }: {
  value: RentalMileage; onChange: (value: RentalMileage) => void; vehicle?: Vehicle; days: number;
  finalized: boolean; createCharge: boolean; onCreateCharge: (value: boolean) => void; existingCharge: boolean;
}) {
  const set = (patch: Partial<RentalMileage>) => onChange({ ...value, ...patch })
  const calc = calculateMileage(value, vehicle)
  const unit = value.kmIncludedUnit || 'total'
  const numeric = (label: string, key: 'kmStart' | 'kmEnd' | 'kmIncludedPerUnit' | 'kmIncludedTotal' | 'kmIncludedPeriods' | 'kmExtraPrice', step = '1') => <label><span className="label">{label}</span><input className="field" name={key} type="number" min="0" step={step} value={value[key] ?? ''} onChange={e => set({ [key]: e.target.value === '' ? undefined : Number(e.target.value) })}/></label>
  return <section className="rounded-2xl border border-orange-100 p-4 sm:col-span-2" aria-label="Kilometraje del alquiler">
    <h3 className="font-display text-lg font-bold">Kilometraje del alquiler</h3>
    <p className="mt-1 text-sm text-stone-500">Registra el cuentakilómetros de entrega y devolución. Cobrar el exceso es opcional.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {numeric('Km iniciales del vehículo', 'kmStart')}
      {numeric('Km finales del vehículo', 'kmEnd')}
      <label><span className="label">Acuerdo de kilómetros incluidos</span><select className="field" value={unit} onChange={e => {
        const next = e.target.value as RentalMileage['kmIncludedUnit']
        set({ kmIncludedUnit: next, kmIncludedPerUnit: next === 'dia' ? vehicle?.includedKmPerDay : next === 'semana' ? (vehicle?.includedKmPerDay ?? 0) * 7 : undefined, kmIncludedPeriods: 1 })
      }}><option value="total">Total pactado manualmente</option><option value="dia">Km por día</option><option value="semana">Km por semana</option><option value="mes">Km por mes</option></select></label>
      {unit === 'total' ? numeric('Km incluidos en el alquiler', 'kmIncludedTotal') : numeric(`Km incluidos por ${unit === 'dia' ? 'día' : unit}`, 'kmIncludedPerUnit')}
      {(unit === 'semana' || unit === 'mes') && numeric(unit === 'semana' ? 'Número de semanas pactadas' : 'Número de meses pactados', 'kmIncludedPeriods', '0.01')}
      {unit !== 'total' && <p className="self-end text-sm text-stone-500">{value.kmIncludedPerUnit ?? '—'} km × {unit === 'dia' ? days : value.kmIncludedPeriods ?? '—'} {unit === 'dia' ? 'días' : unit === 'semana' ? 'semanas' : 'meses'} = <strong>{value.kmIncludedTotal?.toLocaleString('es-ES') ?? '—'} km incluidos</strong>. Puedes elegir un total manual para un acuerdo especial.</p>}
      <label className="flex items-center gap-3 sm:col-span-2"><input type="checkbox" checked={!!value.kmExtraEnabled} onChange={e => { set({ kmExtraEnabled: e.target.checked }); if (!e.target.checked) onCreateCharge(false) }}/><span className="font-semibold">Calcular kilómetros extra</span></label>
      {value.kmExtraEnabled && <>{numeric('Precio pactado por km extra (sin IVA, opcional)', 'kmExtraPrice', '0.01')}<p className="self-end text-sm text-stone-500">Si está vacío se usa la tarifa del vehículo: {euro.format(value.kmExtraDefaultPrice ?? vehicle?.extraKmRate ?? 0)}/km + IVA 21%.</p></>}
      <div className="rounded-xl bg-brand-50 p-3 text-sm sm:col-span-2" aria-live="polite">
        <p>Km realizados: <strong>{calc.used?.toLocaleString('es-ES') ?? 'Pendiente de completar entrega y devolución'}</strong></p>
        {value.kmExtraEnabled && <><p className="mt-1">Km extra: <strong>{calc.extra?.toLocaleString('es-ES') ?? '—'}</strong></p><p className="mt-1">Base: {calc.base === undefined ? '—' : euro.format(calc.base)} · IVA {calc.vatRate}%: {calc.vat === undefined ? '—' : euro.format(calc.vat)}</p><p className="mt-2 font-bold">Total por km extra: {calc.total === undefined ? '—' : euro.format(calc.total)}</p></>}
        {!value.kmExtraEnabled && <p className="mt-1">Control de uso sin cargo por kilómetros extra.</p>}
      </div>
      {finalized && <>
        {value.kmEnd === undefined && <p className="text-sm font-semibold text-amber-800 sm:col-span-2">Faltan km finales. Puedes guardarlo ahora y quedará un aviso para completar el kilometraje.</p>}
        <label><span className="label">Estado de devolución</span><select className="field" value={value.returnCondition || ''} onChange={e => set({ returnCondition: e.target.value })}><option value="">Sin registrar</option><option>Sin incidencias</option><option>Con incidencias</option><option>Pendiente de revisión</option></select></label>
        <label className="sm:col-span-2"><span className="label">Notas de devolución</span><textarea className="field min-h-20" value={value.returnNotes || ''} onChange={e => set({ returnNotes: e.target.value })}/></label>
        {existingCharge ? <p className="text-sm text-stone-500 sm:col-span-2">Ya existe un cargo de km extra asociado. Puedes revisarlo en Pagos; no se creará otro al guardar.</p> : value.kmExtraEnabled && (calc.total ?? 0) > 0 && <label className="flex items-start gap-3 rounded-xl border border-orange-100 p-3 sm:col-span-2"><input type="checkbox" className="mt-1" checked={createCharge} onChange={e => onCreateCharge(e.target.checked)}/><span><strong>Crear pago pendiente por {euro.format(calc.total!)}</strong><span className="mt-1 block text-sm text-stone-500">He revisado el cálculo. El pago será único y quedará vinculado a este alquiler, cliente y vehículo.</span></span></label>}
      </>}
    </div>
  </section>
}
