import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarRange, CheckCircle2, Pencil, Plus, Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Badge, ConfirmButton, EmptyState, Modal, PageHeader } from '../components/ui'
import { useFleet } from '../store/FleetContext'
import { date, euro, uid } from '../lib/format'
import { calculateIncludedKm, calculateRecommendedRentalPrice, inferRentalDays, normalizeBillingPeriod, suggestRentalEndDate, type RentalBillingPeriod } from '../lib/rentalPricing'
import { vehicleLabel } from '../lib/vehicles'
import type { FleetState, PricePeriod, Rental, RentalStatus } from '../types'

const tones = { activo:'success', pendiente:'warning', cancelado:'danger', finalizado:'neutral' } as const
const periods: Record<PricePeriod, string> = { dia:'día', semana:'semana', mes:'mes', otro:'otro periodo' }
const billingOptions: Array<{ value: RentalBillingPeriod; label: string }> = [
  { value:'dia', label:'Por días' },
  { value:'semana', label:'Por semana' },
  { value:'mes', label:'Por mes' },
]

type RentalFormValues = {
  vehicleId: string
  customerId: string
  pricePeriod: RentalBillingPeriod
  durationDays: number
  agreedPrice: number
  startDate: string
  endDate?: string
  expectedKilometers: number
  nextPaymentDate?: string
  status: RentalStatus
  notes: string
}

export default function RentalsPage() {
  const { state, upsert, remove } = useFleet()
  const [params] = useSearchParams()
  const [filter, setFilter] = useState('todos')
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [error, setError] = useState('')

  const blank = (): Rental => ({
    id:'',
    vehicleId:state.vehicles[0]?.id || '',
    customerId:state.customers[0]?.id || '',
    startDate:new Date().toISOString().slice(0, 10),
    endDate:'',
    agreedPrice:state.vehicles[0]?.monthlyRate || 0,
    pricePeriod:'mes',
    durationDays:1,
    expectedKilometers:0,
    nextPaymentDate:'',
    status:'activo',
    notes:'',
  })

  const [editing, setEditing] = useState<Rental | null>(() => params.get('new') === '1' ? blank() : null)
  const vehicleById = useMemo(() => new Map(state.vehicles.map(vehicle => [vehicle.id, vehicle])), [state.vehicles])
  const customerById = useMemo(() => new Map(state.customers.map(customer => [customer.id, customer])), [state.customers])
  const rows = useMemo(() => state.rentals.filter(rental => {
    const customer = customerById.get(rental.customerId)
    const vehicle = vehicleById.get(rental.vehicleId)
    return (filter === 'todos' || rental.status === filter)
      && `${customer?.name} ${vehicleLabel(vehicle)} ${vehicle?.plate} ${rental.status}`.toLowerCase().includes(deferred.toLowerCase())
  }), [state.rentals, customerById, vehicleById, filter, deferred])

  const open = (rental: Rental) => { setError(''); setEditing(rental) }
  const save = (values: RentalFormValues) => {
    const vehicle = vehicleById.get(values.vehicleId)
    if (!values.vehicleId || !values.customerId) { setError('Selecciona un cliente y un vehículo.'); return }
    if (values.pricePeriod === 'dia' && (!values.durationDays || values.durationDays <= 0)) { setError('Introduce el número de días del alquiler.'); return }
    if (calculateRecommendedRentalPrice(vehicle, values.pricePeriod, values.durationDays) === null) { setError('Este vehículo no tiene tarifa configurada para este periodo.'); return }
    if (!values.agreedPrice || values.agreedPrice <= 0) { setError('El precio acordado debe ser superior a 0 €.'); return }

    const item: Rental = {
      id:editing?.id || uid('r'),
      vehicleId:values.vehicleId,
      customerId:values.customerId,
      startDate:values.startDate,
      endDate:values.endDate || undefined,
      agreedPrice:values.agreedPrice,
      pricePeriod:values.pricePeriod,
      durationDays:values.pricePeriod === 'dia' ? values.durationDays : undefined,
      expectedKilometers:values.expectedKilometers || 0,
      nextPaymentDate:values.nextPaymentDate || undefined,
      status:values.status,
      notes:values.notes.trim(),
    }

    upsert('rentals', item)
    if (!editing?.id && item.nextPaymentDate) upsert('payments', { id:uid('p'), rentalId:item.id, dueDate:item.nextPaymentDate, amount:item.agreedPrice, status:'pendiente', method:'', notes:'' })
    setEditing(null)
  }
  const finalize = (rental: Rental) => {
    upsert('rentals', { ...rental, status:'finalizado', endDate:new Date().toISOString().slice(0, 10) })
  }
  const canCreate = state.vehicles.length > 0 && state.customers.length > 0

  return <div className="fade-up">
    <PageHeader eyebrow="Contratos" title="Alquileres" description="Gestiona alquileres por días, semanas y meses con tarifas automáticas editables." action={state.rentals.length > 0 ? <button className="btn-primary" disabled={!canCreate} onClick={() => open(blank())}><Plus size={18}/> Crear alquiler</button> : undefined}/>
    {state.rentals.length > 0 && <>
      <div className="mb-3 flex flex-wrap gap-2">{[['todos','Todos'],['activo','Activos'],['pendiente','Pendientes'],['finalizado','Finalizados'],['cancelado','Cancelados']].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`min-h-10 cursor-pointer rounded-xl px-4 text-sm font-bold ${filter === value ? 'bg-brand-500 text-white' : 'border border-orange-100 bg-white text-stone-600'}`}>{label}</button>)}</div>
      <label className="group relative mb-5 block max-w-2xl"><span className="sr-only">Buscar alquiler</span><input className="field border-orange-200 pr-11" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar cliente, vehículo, matrícula o estado"/>{!query && <Search className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-500 group-focus-within:hidden" size={18}/>}</label>
    </>}
    <div className="table-shell">{state.rentals.length > 0 ? rows.length ? <table className="data-table"><thead><tr><th>Alquiler</th><th>Fechas</th><th>Estado</th><th>Próximo pago</th><th>Precio</th><th>Km previstos</th><th>Acciones</th></tr></thead><tbody>{rows.map(rental => {
      const vehicle = vehicleById.get(rental.vehicleId)
      const customer = customerById.get(rental.customerId)
      return <tr key={rental.id}><td><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><CalendarRange size={19}/></span><div><p className="font-bold">{vehicleLabel(vehicle)}</p><p className="text-xs text-stone-500">{customer?.name} · {vehicle?.plate}</p></div></div></td><td>{date(rental.startDate)}<span className="block text-xs text-stone-500">{rental.endDate ? `hasta ${date(rental.endDate)}` : 'Sin fecha final'}</span></td><td><Badge tone={tones[rental.status]}>{rental.status}</Badge></td><td>{rental.nextPaymentDate ? date(rental.nextPaymentDate) : 'Sin recordatorio'}{rental.nextPaymentDate && <span className="block text-xs text-stone-500">Recurrente mensual</span>}</td><td className="font-bold">{euro.format(rental.agreedPrice)}<span className="block text-xs font-normal text-stone-500">/{periods[rental.pricePeriod]}</span></td><td>{rental.expectedKilometers ? rental.expectedKilometers.toLocaleString('es-ES') : 'Sin estimación'}</td><td><div className="flex items-center gap-4"><button onClick={() => open(rental)} aria-label="Editar alquiler" className="text-stone-500 hover:text-brand-600"><Pencil size={18}/></button>{rental.status === 'activo' && <button onClick={() => finalize(rental)} aria-label="Finalizar alquiler" className="text-emerald-700"><CheckCircle2 size={19}/></button>}<ConfirmButton onConfirm={() => remove('rentals', rental.id)}/></div></td></tr>
    })}</tbody></table> : <EmptyState title="No hay alquileres que coincidan." description="Ajusta la búsqueda o cambia el filtro para ver más resultados."/> : <EmptyState title="No hay alquileres creados." description={canCreate ? 'Crea el primer alquiler y elige su periodo.' : 'Añade primero un vehículo y un cliente.'} action={canCreate ? <button className="btn-primary" onClick={() => open(blank())}><Plus size={18}/> Crear alquiler</button> : undefined}/>}</div>
    {editing && <RentalModal rental={editing} state={state} error={error} onClose={() => setEditing(null)} onSave={save}/>}
  </div>
}

function RentalModal({ rental, state, error, onClose, onSave }: { rental: Rental; state: FleetState; error: string; onClose: () => void; onSave: (values: RentalFormValues) => void }) {
  const initialPeriod = normalizeBillingPeriod(rental.pricePeriod)
  const initialDays = rental.durationDays || inferRentalDays(rental.startDate, rental.endDate) || 1
  const [vehicleId, setVehicleId] = useState(rental.vehicleId)
  const [customerId, setCustomerId] = useState(rental.customerId)
  const [pricePeriod, setPricePeriod] = useState<RentalBillingPeriod>(initialPeriod)
  const [durationDays, setDurationDays] = useState(String(initialDays))
  const [agreedPrice, setAgreedPrice] = useState(String(rental.agreedPrice || ''))
  const [priceTouched, setPriceTouched] = useState(Boolean(rental.id))
  const [startDate, setStartDate] = useState(rental.startDate)
  const [endDate, setEndDate] = useState(rental.endDate || '')
  const [endDateTouched, setEndDateTouched] = useState(Boolean(rental.endDate))
  const [expectedKilometers, setExpectedKilometers] = useState(String(rental.expectedKilometers || ''))
  const [nextPaymentDate, setNextPaymentDate] = useState(rental.nextPaymentDate || '')
  const [status, setStatus] = useState<RentalStatus>(rental.status)
  const [notes, setNotes] = useState(rental.notes)
  const selectedVehicle = useMemo(() => state.vehicles.find(vehicle => vehicle.id === vehicleId), [state.vehicles, vehicleId])
  const daysNumber = Number(durationDays)
  const validDays = Number.isFinite(daysNumber) && daysNumber > 0
  const recommendedPrice = useMemo(() => calculateRecommendedRentalPrice(selectedVehicle, pricePeriod, daysNumber), [selectedVehicle, pricePeriod, daysNumber])
  const includedKm = useMemo(() => calculateIncludedKm(selectedVehicle, pricePeriod, daysNumber), [selectedVehicle, pricePeriod, daysNumber])

  useEffect(() => {
    if (priceTouched || recommendedPrice === null) return
    const timeout = window.setTimeout(() => setAgreedPrice(String(recommendedPrice)), 0)
    return () => window.clearTimeout(timeout)
  }, [priceTouched, recommendedPrice])

  useEffect(() => {
    if (endDateTouched || pricePeriod !== 'dia' || !validDays) return
    const timeout = window.setTimeout(() => setEndDate(suggestRentalEndDate(startDate, daysNumber)), 0)
    return () => window.clearTimeout(timeout)
  }, [daysNumber, endDateTouched, pricePeriod, startDate, validDays])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave({
      vehicleId,
      customerId,
      pricePeriod,
      durationDays:daysNumber,
      agreedPrice:Number(agreedPrice),
      startDate,
      endDate,
      expectedKilometers:Number(expectedKilometers) || 0,
      nextPaymentDate,
      status,
      notes,
    })
  }
  const recalculate = () => {
    if (recommendedPrice === null) return
    setAgreedPrice(String(recommendedPrice))
    setPriceTouched(false)
  }

  return <Modal title={rental.id ? 'Editar alquiler' : 'Crear alquiler'} onClose={onClose}>
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 sm:col-span-2">{error}</p>}
      <label><span className="label">Vehículo *</span><select name="vehicleId" className="field" value={vehicleId} onChange={event => setVehicleId(event.target.value)} required>{state.vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)} · {vehicle.plate}</option>)}</select></label>
      <label><span className="label">Cliente *</span><select name="customerId" className="field" value={customerId} onChange={event => setCustomerId(event.target.value)} required>{state.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <label><span className="label">Tipo de alquiler *</span><select name="pricePeriod" className="field" value={pricePeriod} onChange={event => setPricePeriod(event.target.value as RentalBillingPeriod)}>{billingOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {pricePeriod === 'dia' && <label><span className="label">Número de días *</span><input name="durationDays" type="number" min="1" step="1" className="field" value={durationDays} onChange={event => setDurationDays(event.target.value)} required/></label>}
      <label><span className="label">Precio acordado (€) *</span><input name="agreedPrice" type="number" min="0.01" step="0.01" className="field" value={agreedPrice} onChange={event => { setAgreedPrice(event.target.value); setPriceTouched(true) }} required/></label>
      <div className="rounded-2xl border border-orange-100 bg-brand-50/70 p-4 text-sm text-stone-600 sm:col-span-2">
        {!selectedVehicle ? <p className="font-semibold">Selecciona un vehículo para calcular la tarifa.</p>
          : pricePeriod === 'dia' && !validDays ? <p className="font-semibold text-red-700">Introduce el número de días del alquiler.</p>
          : recommendedPrice === null ? <p className="font-semibold text-red-700">Este vehículo no tiene tarifa configurada para este periodo.</p>
          : <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-bold text-ink">Precio recomendado según tarifa: {euro.format(recommendedPrice)}</p><p className="mt-1 text-xs">Precio acordado: editable si pactas otra tarifa.</p>{priceTouched && <p className="mt-2 text-xs font-bold text-brand-700">Has modificado el precio manualmente.</p>}</div>
            {priceTouched && <button type="button" className="btn-secondary justify-center" onClick={recalculate}>Recalcular según tarifa</button>}
          </div>}
      </div>
      <label><span className="label">Fecha de inicio *</span><input name="startDate" type="date" className="field" value={startDate} onChange={event => setStartDate(event.target.value)} required/></label>
      <label><span className="label">Fecha final (opcional)</span><input name="endDate" type="date" className="field" value={endDate} onChange={event => { setEndDate(event.target.value); setEndDateTouched(true) }}/></label>
      <label><span className="label">Kilómetros previstos</span><input name="expectedKilometers" type="number" min="0" className="field" value={expectedKilometers} onChange={event => setExpectedKilometers(event.target.value)}/></label>
      <label><span className="label">Estado</span><select name="status" className="field" value={status} onChange={event => setStatus(event.target.value as RentalStatus)}>{['activo','pendiente','finalizado','cancelado'].map(value => <option key={value}>{value}</option>)}</select></label>
      {includedKm !== null && <p className="self-end rounded-xl bg-brand-50 p-3 text-sm text-stone-600 sm:col-span-2">Km incluidos estimados: {selectedVehicle?.includedKmPerDay} km × {daysNumber} días = {includedKm.toLocaleString('es-ES')} km.</p>}
      <label><span className="label">Próxima fecha de pago (opcional)</span><input name="nextPaymentDate" type="date" className="field" value={nextPaymentDate} onChange={event => setNextPaymentDate(event.target.value)}/></label>
      <p className="self-end rounded-xl bg-brand-50 p-3 text-sm text-stone-600">Si indicas una fecha, el aviso se repetirá cada mes al registrar el cobro.</p>
      <label className="sm:col-span-2"><span className="label">Notas</span><textarea name="notes" className="field min-h-24" value={notes} onChange={event => setNotes(event.target.value)}/></label>
      <div className="flex gap-3 sm:col-span-2 sm:justify-end"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary">Guardar alquiler</button></div>
    </form>
  </Modal>
}
