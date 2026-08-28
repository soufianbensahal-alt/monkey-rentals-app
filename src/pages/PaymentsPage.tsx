import { useDeferredValue, useMemo, useState, type FormEvent } from 'react'
import { Check, CreditCard, Pencil, Plus, Search } from 'lucide-react'
import { Badge, ConfirmButton, EmptyState, Modal, PageHeader, StatCard } from '../components/ui'
import { useFleet } from '../store/FleetContext'
import { date, euro, uid } from '../lib/format'
import { effectivePaymentStatus } from '../lib/payments'
import { isFlexiblePayment, paymentKindLabel, paymentReminderLabel, paymentTypeLabels, recurrenceFromFrequency, reminderFrequencyLabels } from '../lib/paymentReminders'
import { vehicleLabel } from '../lib/vehicles'
import type { Payment, PaymentStatus, PaymentType, ReminderFrequency } from '../types'

const tones = { pagado:'success', pendiente:'warning', atrasado:'danger', flexible:'info', cancelado:'neutral' } as const
const statusOptions: PaymentStatus[] = ['pendiente', 'pagado', 'atrasado', 'cancelado']
const paymentTypes: PaymentType[] = ['normal', 'flexible', 'fianza', 'penalizacion', 'km_extra', 'multa', 'otro']
const reminderFrequencies: ReminderFrequency[] = ['none', 'once', 'daily', 'weekly', 'biweekly', 'monthly', 'custom']

export default function PaymentsPage() {
  const { state, upsert, remove, markPaymentPaid } = useFleet()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [filter, setFilter] = useState('todos')
  const [editing, setEditing] = useState<Payment | null>(null)
  const [error, setError] = useState('')

  const decorated = useMemo(() => state.payments.map(payment => {
    const rental = state.rentals.find(item => item.id === payment.rentalId)
    const customer = state.customers.find(item => item.id === rental?.customerId)
    const vehicle = state.vehicles.find(item => item.id === rental?.vehicleId)
    return { payment, rental, customer, vehicle, status:effectivePaymentStatus(payment), flexible:isFlexiblePayment(payment) }
  }), [state])
  const rows = useMemo(() => decorated.filter(item => {
    const matchesFilter = filter === 'todos'
      || item.status === filter
      || (filter === 'flexible' && item.flexible)
    const haystack = `${item.customer?.name} ${vehicleLabel(item.vehicle)} ${item.vehicle?.plate} ${item.payment.dueDate} ${item.status} ${paymentKindLabel(item.payment)} ${paymentReminderLabel(item.payment)}`.toLowerCase()
    return matchesFilter && haystack.includes(deferred.toLowerCase())
  }), [decorated, filter, deferred])
  const paid = decorated.filter(item => item.status === 'pagado').reduce((sum, item) => sum + item.payment.amount, 0)
  const pending = decorated.filter(item => item.status !== 'pagado' && item.status !== 'cancelado').reduce((sum, item) => sum + item.payment.amount, 0)
  const overdue = decorated.filter(item => item.status === 'atrasado').reduce((sum, item) => sum + item.payment.amount, 0)
  const flexible = decorated.filter(item => item.flexible && item.status !== 'pagado' && item.status !== 'cancelado').reduce((sum, item) => sum + item.payment.amount, 0)
  const open = (payment: Payment) => { setError(''); setEditing(payment) }
  const blank = (): Payment => ({
    id:'',
    rentalId:state.rentals[0]?.id || '',
    dueDate:new Date().toISOString().slice(0, 10),
    amount:state.rentals[0]?.nextPaymentAmount || state.rentals[0]?.agreedPrice || 0,
    status:'pendiente',
    type:'normal',
    reminderEnabled:false,
    reminderDate:'',
    reminderFrequency:'none',
    recurrenceType:'unico',
    recurrenceInterval:1,
    method:'',
    notes:'',
    flexibleNotes:'',
  })
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('amount'))
    const dueDate = String(form.get('dueDate'))
    const rentalId = String(form.get('rentalId'))
    const type = String(form.get('type')) as PaymentType
    const reminderFrequency = String(form.get('reminderFrequency')) as ReminderFrequency
    const recurrenceInterval = Math.max(1, Number(form.get('recurrenceInterval')) || 1)
    const status = String(form.get('status')) as PaymentStatus
    if (!rentalId || !dueDate || amount <= 0) {
      setError('Completa el alquiler, la fecha y un importe válido.')
      return
    }
    upsert('payments', {
      id:editing?.id || uid('p'),
      rentalId,
      dueDate,
      paidDate:status === 'pagado' ? (editing?.paidDate || new Date().toISOString().slice(0, 10)) : undefined,
      amount,
      status,
      type,
      reminderEnabled:reminderFrequency !== 'none',
      reminderDate:reminderFrequency !== 'none' ? dueDate : undefined,
      reminderFrequency,
      recurrenceType:recurrenceFromFrequency(reminderFrequency),
      recurrenceInterval,
      isFlexible:type === 'flexible',
      flexibleNotes:String(form.get('flexibleNotes')).trim(),
      method:String(form.get('method')),
      notes:String(form.get('notes')).trim(),
    })
    setEditing(null)
  }

  return <div className="fade-up">
    <PageHeader
      eyebrow="Cobros"
      title="Pagos"
      description="Controla importes pendientes, cobrados, flexibles y recordatorios."
      action={state.payments.length > 0 ? <button className="btn-primary" disabled={!state.rentals.length} onClick={() => open(blank())}><Plus size={18}/> Registrar pago</button> : undefined}
    />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Cobrado" value={euro.format(paid)} detail="Pagos registrados" icon={Check} tone="green"/>
      <StatCard label="Por cobrar" value={euro.format(pending)} detail="Pendientes y flexibles" icon={CreditCard}/>
      <StatCard label="Flexible" value={euro.format(flexible)} detail="Requiere seguimiento manual" icon={CreditCard} tone="blue"/>
      <StatCard label="Dinero atrasado" value={euro.format(overdue)} detail={`${decorated.filter(item => item.status === 'atrasado').length} pagos requieren seguimiento`} icon={CreditCard} tone="red"/>
    </section>
    {state.payments.length > 0 && <>
      <div className="mt-5 flex flex-wrap gap-2">{['todos', 'pendiente', 'atrasado', 'flexible', 'pagado', 'cancelado'].map(value => <button key={value} className={`min-h-10 rounded-xl px-4 text-sm font-bold capitalize ${filter === value ? 'bg-brand-500 text-white' : 'border border-orange-100 bg-white text-stone-600'}`} onClick={() => setFilter(value)}>{value}</button>)}</div>
      <label className="group relative my-4 block max-w-2xl"><span className="sr-only">Buscar pagos</span><input className="field pr-11" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar cliente, vehículo, fecha, tipo o estado"/>{!query && <Search className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-500 group-focus-within:hidden" size={18}/>}</label>
    </>}
    <div className="table-shell mt-5">
      {state.payments.length ? rows.length ? <table className="data-table">
        <thead><tr><th>Cliente y vehículo</th><th>Fecha</th><th>Tipo</th><th>Estado</th><th>Recordatorio</th><th>Importe</th><th>Acciones</th></tr></thead>
        <tbody>{rows.map(({ payment, customer, vehicle, status, flexible }) => <tr key={payment.id}>
          <td><p className="font-bold">{customer?.name || 'Cliente no disponible'}</p><p className="text-xs text-stone-500">{vehicleLabel(vehicle)} · {vehicle?.plate}</p></td>
          <td>{date(payment.dueDate)}{payment.paidDate && <span className="block text-xs text-stone-500">Pagado: {date(payment.paidDate)}</span>}</td>
          <td>{paymentKindLabel(payment)}{flexible && payment.flexibleNotes && <span className="block text-xs text-stone-500">{payment.flexibleNotes}</span>}</td>
          <td><Badge tone={flexible && status !== 'pagado' ? 'info' : tones[status]}>{flexible && status !== 'pagado' ? 'flexible' : status}</Badge></td>
          <td>{paymentReminderLabel(payment)}</td>
          <td className="font-bold">{euro.format(payment.amount)}</td>
          <td><div className="flex items-center gap-3">{status !== 'pagado' && status !== 'cancelado' && <button className="btn-primary min-h-9 px-3 py-1 text-xs" onClick={() => markPaymentPaid(payment.id)}><Check size={15}/> Pagado</button>}<button onClick={() => open(payment)} aria-label="Editar pago" className="text-stone-500 hover:text-brand-600"><Pencil size={18}/></button><ConfirmButton onConfirm={() => remove('payments', payment.id)}/></div></td>
        </tr>)}</tbody>
      </table> : <EmptyState title="No hay pagos que coincidan." description="Ajusta la búsqueda o cambia el filtro para ver más resultados."/> : <EmptyState title="No hay pagos registrados." description="Los pagos creados desde alquileres aparecerán aquí." action={state.rentals.length ? <button className="btn-primary" onClick={() => open(blank())}><Plus size={18}/> Registrar pago</button> : undefined}/>}
    </div>
    {editing && <Modal title={editing.id ? 'Editar pago' : 'Registrar pago'} onClose={() => setEditing(null)}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 sm:col-span-2">{error}</p>}
        <label className="sm:col-span-2"><span className="label">Alquiler *</span><select className="field" name="rentalId" defaultValue={editing.rentalId} required>{state.rentals.map(rental => { const customer = state.customers.find(item => item.id === rental.customerId), vehicle = state.vehicles.find(item => item.id === rental.vehicleId); return <option key={rental.id} value={rental.id}>{customer?.name} · {vehicleLabel(vehicle)} ({vehicle?.plate})</option> })}</select></label>
        <Field label="Fecha de pago" name="dueDate" type="date" value={editing.dueDate}/>
        <Field label="Importe (€)" name="amount" type="number" value={editing.amount}/>
        <label><span className="label">Tipo de pago</span><select className="field" name="type" defaultValue={editing.type || (editing.status === 'flexible' ? 'flexible' : 'normal')}>{paymentTypes.map(value => <option key={value} value={value}>{paymentTypeLabels[value]}</option>)}</select></label>
        <label><span className="label">Estado</span><select className="field" name="status" defaultValue={editing.status === 'flexible' ? 'pendiente' : editing.status}>{statusOptions.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span className="label">Recordatorio</span><select className="field" name="reminderFrequency" defaultValue={editing.reminderFrequency || 'none'}>{reminderFrequencies.map(value => <option key={value} value={value}>{reminderFrequencyLabels[value]}</option>)}</select></label>
        <Field label="Intervalo personalizado (días)" name="recurrenceInterval" type="number" value={editing.recurrenceInterval || 1}/>
        <label><span className="label">Método de pago</span><select className="field" name="method" defaultValue={editing.method}><option value="">Sin indicar</option><option>Transferencia</option><option>Efectivo</option><option>Bizum</option><option>Domiciliación</option><option>Tarjeta</option></select></label>
        <label className="sm:col-span-2"><span className="label">Notas pago flexible</span><input className="field" name="flexibleNotes" defaultValue={editing.flexibleNotes || ''} placeholder="Ej. Cliente paga cuando cobre, revisar por WhatsApp"/></label>
        <label className="sm:col-span-2"><span className="label">Notas</span><textarea className="field min-h-24" name="notes" defaultValue={editing.notes}/></label>
        <div className="flex gap-3 sm:col-span-2 sm:justify-end"><button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="btn-primary">Guardar pago</button></div>
      </form>
    </Modal>}
  </div>
}

function Field({ label, name, type, value }: { label: string; name: string; type: string; value: string | number }) {
  return <label><span className="label">{label} *</span><input className="field" name={name} type={type} min={type === 'number' ? '0.01' : undefined} step={type === 'number' ? '0.01' : undefined} defaultValue={value} required/></label>
}
