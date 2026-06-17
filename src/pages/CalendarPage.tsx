import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Plus,
  ReceiptText,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useFleet } from '../store/FleetContext'
import { Modal, PageHeader } from '../components/ui'
import { date, euro, uid } from '../lib/format'
import { vehicleLabel } from '../lib/vehicles'
import type { CalendarEvent } from '../types'

type View = 'month' | 'week' | 'day'
type EventType = 'pago' | 'atrasado' | 'alquiler' | 'itv' | 'mantenimiento' | 'documento' | 'impuesto' | 'multa' | 'reserva'

interface AgendaEvent {
  id: string
  date: string
  title: string
  detail: string
  type: EventType
}

const eventStyle: Record<EventType, { label: string; icon: LucideIcon; dot: string; badge: string; card: string }> = {
  pago: { label: 'Pago', icon: CircleDollarSign, dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800', card: 'border-orange-200 bg-orange-50/70' },
  atrasado: { label: 'Pago atrasado', icon: AlertTriangle, dot: 'bg-red-500', badge: 'bg-red-100 text-red-800', card: 'border-red-200 bg-red-50/70' },
  alquiler: { label: 'Alquiler', icon: Car, dot: 'bg-emerald-700', badge: 'bg-emerald-100 text-emerald-800', card: 'border-emerald-200 bg-emerald-50/70' },
  itv: { label: 'ITV', icon: FileCheck2, dot: 'bg-cyan-800', badge: 'bg-cyan-100 text-cyan-900', card: 'border-cyan-200 bg-cyan-50/70' },
  mantenimiento: { label: 'Mantenimiento', icon: Wrench, dot: 'bg-slate-600', badge: 'bg-slate-200 text-slate-800', card: 'border-slate-200 bg-slate-50/70' },
  documento: { label: 'Documentación', icon: FileCheck2, dot: 'bg-blue-600', badge: 'bg-blue-100 text-blue-800', card: 'border-blue-200 bg-blue-50/70' },
  impuesto: { label: 'Impuesto', icon: ReceiptText, dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-900', card: 'border-amber-200 bg-amber-50/70' },
  multa: { label: 'Multa', icon: AlertTriangle, dot: 'bg-rose-600', badge: 'bg-rose-100 text-rose-800', card: 'border-rose-200 bg-rose-50/70' },
  reserva: { label: 'Recordatorio', icon: CalendarCheck, dot: 'bg-teal-700', badge: 'bg-teal-100 text-teal-900', card: 'border-teal-200 bg-teal-50/70' },
}

const iso = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
const fromIso = (value: string) => new Date(`${value}T12:00:00`)
const monthName = (month: number) => new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(2026, month, 1))
const longDate = (value: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(fromIso(value))

export default function CalendarPage() {
  const { state, upsert } = useFleet()
  const [cursor, setCursor] = useState(() => new Date())
  const [view, setView] = useState<View>('month')
  const [selected, setSelected] = useState(() => iso(new Date()))
  const [adding, setAdding] = useState(false)

  const events = useMemo<AgendaEvent[]>(() => [
    ...state.events.map(event => ({
      id: `event-${event.id}`,
      date: event.date,
      title: event.title,
      detail: event.type === 'reserva' ? 'Recordatorio manual' : event.type,
      type: event.type === 'itv' ? 'itv' as const : event.type === 'mantenimiento' ? 'mantenimiento' as const : event.type === 'reserva' ? 'reserva' as const : 'alquiler' as const,
    })),
    ...state.payments.map(payment => {
      const rental = state.rentals.find(item => item.id === payment.rentalId)
      const customer = state.customers.find(item => item.id === rental?.customerId)
      const vehicle = state.vehicles.find(item => item.id === rental?.vehicleId)
      return {
        id: `payment-${payment.id}`,
        date: payment.dueDate,
        title: payment.status === 'atrasado' ? `${customer?.name || 'Cliente'} · pago atrasado` : `Pago ${vehicleLabel(vehicle)}`,
        detail: `${euro.format(payment.amount)} · ${customer?.name || 'Cliente'}`,
        type: payment.status === 'atrasado' ? 'atrasado' as const : 'pago' as const,
      }
    }),
    ...state.rentals.flatMap(rental => {
      const vehicle = state.vehicles.find(item => item.id === rental.vehicleId)
      const customer = state.customers.find(item => item.id === rental.customerId)
      const detail = `${vehicleLabel(vehicle)} · ${customer?.name || 'Cliente'}`
      return [
        { id: `rental-start-${rental.id}`, date: rental.startDate, title: 'Entrega de vehículo', detail, type: 'alquiler' as const },
        ...(rental.endDate ? [{ id: `rental-end-${rental.id}`, date: rental.endDate, title: 'Devolución de vehículo', detail, type: 'alquiler' as const }] : []),
      ]
    }),
    ...state.maintenance.map(item => ({ id: `maintenance-${item.id}`, date: item.date, title: item.type, detail: vehicleLabel(state.vehicles.find(vehicle => vehicle.id === item.vehicleId)), type: 'mantenimiento' as const })),
    ...state.documents.map(item => ({ id: `document-${item.id}`, date: item.expiryDate, title: `Vence ${item.type}`, detail: vehicleLabel(state.vehicles.find(vehicle => vehicle.id === item.vehicleId)), type: item.type.toLowerCase().includes('itv') ? 'itv' as const : 'documento' as const })),
    ...state.taxes.map(item => ({ id: `tax-${item.id}`, date: item.dueDate, title: item.concept, detail: `${vehicleLabel(state.vehicles.find(vehicle => vehicle.id === item.vehicleId))} · ${euro.format(item.amount)}`, type: 'impuesto' as const })),
    ...state.fines.map(item => ({ id: `fine-${item.id}`, date: item.dueDate || item.infractionDate, title: item.concept, detail: `${vehicleLabel(state.vehicles.find(vehicle => vehicle.id === item.vehicleId))} · ${euro.format(item.amount)}`, type: 'multa' as const })),
  ], [state])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const selectedEvents = events.filter(event => event.date === selected)
  const monthEvents = events.filter(event => event.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
  const pendingCount = monthEvents.filter(event => ['pago', 'atrasado', 'impuesto', 'multa'].includes(event.type)).length

  const setMonth = (nextMonth: number) => setCursor(new Date(year, nextMonth, 1))
  const setYear = (nextYear: number) => setCursor(new Date(nextYear, month, 1))
  const move = (delta: number) => {
    if (view === 'month') {
      setCursor(new Date(year, month + delta, 1))
      return
    }
    const next = fromIso(selected)
    next.setDate(next.getDate() + delta * (view === 'week' ? 7 : 1))
    setSelected(iso(next))
    setCursor(next)
  }
  const goToday = () => {
    const now = new Date()
    setCursor(now)
    setSelected(iso(now))
  }
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    upsert('events', {
      id: uid('event'),
      title: String(form.get('title')).trim(),
      date: String(form.get('date')),
      type: String(form.get('type')) as CalendarEvent['type'],
    })
    setAdding(false)
  }

  return <div className="fade-up">
    <PageHeader
      eyebrow="Planificación central"
      title="Calendario de avisos"
      description="Controla pagos, alquileres, ITV, mantenimiento, impuestos y multas desde un solo lugar."
      action={events.length > 0 ? <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={18}/> Añadir recordatorio</button> : undefined}
    />

    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="calendar-view-switch" aria-label="Vista del calendario">
        {(['month', 'week', 'day'] as View[]).map(value => <button key={value} onClick={() => setView(value)} aria-pressed={view === value}>{value === 'month' ? 'Mes' : value === 'week' ? 'Semana' : 'Día'}</button>)}
      </div>
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <span className="size-2.5 rounded-full bg-orange-500"/>
        <span>{monthEvents.length} avisos este mes</span>
        <span aria-hidden="true">·</span>
        <strong className="text-ink">{pendingCount} económicos</strong>
      </div>
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(320px,.75fr)]">
      <section className="calendar-shell" aria-label="Calendario principal">
        <header className="calendar-toolbar">
          <button className="calendar-arrow" onClick={() => move(-1)} aria-label="Periodo anterior"><ChevronLeft/></button>
          {view === 'month' ? <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:max-w-md">
            <label className="sr-only" htmlFor="calendar-month">Mes</label>
            <select id="calendar-month" className="calendar-select capitalize" value={month} onChange={event => setMonth(Number(event.target.value))}>
              {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{monthName(index)}</option>)}
            </select>
            <label className="sr-only" htmlFor="calendar-year">Año</label>
            <select id="calendar-year" className="calendar-select" value={year} onChange={event => setYear(Number(event.target.value))}>
              {Array.from({ length: 9 }, (_, index) => year - 4 + index).map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div> : <h2 className="min-w-0 flex-1 truncate text-center font-display text-lg font-extrabold capitalize sm:text-2xl">{view === 'day' ? longDate(selected) : `Semana del ${date(weekDates(selected)[0])}`}</h2>}
          <button className="calendar-arrow" onClick={() => move(1)} aria-label="Periodo siguiente"><ChevronRight/></button>
        </header>

        <div className="flex items-center justify-between border-b border-orange-100 px-4 py-3 sm:px-7">
          <button className="calendar-today-button text-sm font-bold text-brand-600 transition hover:text-brand-700" onClick={goToday}>Ir a hoy</button>
          <p className="hidden text-sm text-stone-500 sm:block">Selecciona un día para consultar sus avisos</p>
        </div>

        {view === 'month' && <MonthGrid cursor={cursor} selected={selected} events={events} onSelect={setSelected}/>} 
        {view === 'week' && <WeekView selected={selected} events={events} onSelect={setSelected}/>} 
        {view === 'day' && <DayTimeline day={selected} events={selectedEvents}/>} 
      </section>

      <AgendaPanel selected={selected} events={selectedEvents} showEmptyAction={events.length === 0} onAdd={() => setAdding(true)}/>
    </div>

    <section className="mt-5 flex flex-col gap-4 rounded-2xl border border-orange-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <p className="font-display font-bold text-ink">Código de categorías</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {(['pago', 'atrasado', 'itv', 'mantenimiento', 'impuesto', 'multa', 'alquiler'] as EventType[]).map(type => <span key={type} className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600"><span className={`size-2.5 rounded-full ${eventStyle[type].dot}`}/>{eventStyle[type].label}</span>)}
        </div>
      </div>
      <Link to="/app/alertas" className="btn-secondary shrink-0">Ver todos los avisos</Link>
    </section>

    {adding && <Modal title="Añadir recordatorio" onClose={() => setAdding(false)}>
      <form className="grid gap-4" onSubmit={save}>
        <label><span className="label">Título</span><input className="field" name="title" required placeholder="Ej. Entrega de furgoneta · 10:30"/></label>
        <label><span className="label">Fecha</span><input className="field" name="date" type="date" defaultValue={selected} required/></label>
        <label><span className="label">Tipo de recordatorio</span><select className="field" name="type"><option value="reserva">Reserva</option><option value="entrega">Entrega</option><option value="devolución">Devolución</option><option value="itv">ITV</option><option value="mantenimiento">Mantenimiento</option></select></label>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancelar</button><button className="btn-primary">Guardar recordatorio</button></div>
      </form>
    </Modal>}
  </div>
}

function MonthGrid({ cursor, selected, events, onSelect }: { cursor: Date; selected: string; events: AgendaEvent[]; onSelect: (date: string) => void }) {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  const days = Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start)
    value.setDate(start.getDate() + index)
    return value
  })
  const today = iso(new Date())

  return <div className="p-3 sm:p-6">
    <div className="calendar-weekdays">{['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">
      {days.map(day => {
        const value = iso(day)
        const dayEvents = events.filter(event => event.date === value)
        const inMonth = day.getMonth() === month
        const isSelected = selected === value
        const isToday = today === value
        const tooltip = dayEvents.map(event => `${eventStyle[event.type].label}: ${event.title}`).join(' · ')
        return <button
          key={value}
          className={`calendar-day ${!inMonth ? 'calendar-day-muted' : ''} ${isToday ? 'calendar-day-today' : ''} ${isSelected ? 'calendar-day-selected' : ''}`}
          onClick={() => onSelect(value)}
          aria-pressed={isSelected}
          aria-label={`${longDate(value)}${dayEvents.length ? `, ${dayEvents.length} avisos` : ''}`}
          title={tooltip || undefined}
        >
          <span className="calendar-day-number">{day.getDate()}</span>
          {dayEvents.length > 0 && <span className="calendar-dots" aria-hidden="true">{dayEvents.slice(0, 3).map(event => <span key={event.id} className={eventStyle[event.type].dot}/>)}</span>}
        </button>
      })}
    </div>
  </div>
}

function AgendaPanel({ selected, events, showEmptyAction, onAdd }: { selected: string; events: AgendaEvent[]; showEmptyAction: boolean; onAdd: () => void }) {
  return <aside className="calendar-agenda">
    <div className="calendar-agenda-header">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand-600">Agenda del día</p>
        <h2 className="mt-1 font-display text-2xl font-extrabold capitalize text-ink">{longDate(selected)}</h2>
      </div>
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-orange-100 text-brand-600"><CalendarDays/></span>
    </div>
    <div className="mt-5 flex items-center justify-between">
      <p className="font-bold text-ink">{events.length} aviso{events.length === 1 ? '' : 's'}</p>
    </div>
    <div className="mt-3 space-y-3">
      {events.length ? events.map(event => <AgendaCard key={event.id} event={event}/>) : <div className="calendar-empty">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600"><CalendarCheck/></span>
        <p className="mt-4 font-bold text-ink">Día despejado</p>
        <p className="mt-1 text-sm leading-6 text-stone-500">No hay pagos, entregas ni vencimientos previstos para esta fecha.</p>
        {showEmptyAction && <button className="mt-4 text-sm font-bold text-brand-600" onClick={onAdd}>Crear un recordatorio</button>}
      </div>}
    </div>
  </aside>
}

function AgendaCard({ event }: { event: AgendaEvent }) {
  const style = eventStyle[event.type]
  const Icon = style.icon
  return <article className={`calendar-agenda-card ${style.card}`}>
    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${style.badge}`}><Icon size={19}/></span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide ${style.badge}`}>{style.label}</span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-stone-500"><Clock3 size={13}/> Todo el día</span>
      </div>
      <h3 className="mt-2 font-bold leading-snug text-ink">{event.title}</h3>
      <p className="mt-1 text-sm leading-5 text-stone-600">{event.detail}</p>
    </div>
  </article>
}

function DayTimeline({ day, events }: { day: string; events: AgendaEvent[] }) {
  return <div className="min-h-[440px] p-4 sm:p-7">
    <div className="mb-6 flex items-end justify-between border-b border-orange-100 pb-5"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand-600">Vista diaria</p><h3 className="mt-1 font-display text-2xl font-extrabold capitalize">{longDate(day)}</h3></div><span className="text-sm text-stone-500">{events.length} avisos</span></div>
    <div className="space-y-3">{events.length ? events.map(event => <AgendaCard key={event.id} event={event}/>) : <p className="calendar-empty">No hay actividad planificada para este día.</p>}</div>
  </div>
}

function weekDates(selected: string) {
  const base = fromIso(selected)
  const offset = (base.getDay() + 6) % 7
  const monday = new Date(base)
  monday.setDate(base.getDate() - offset)
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(monday)
    value.setDate(monday.getDate() + index)
    return iso(value)
  })
}

function WeekView({ selected, events, onSelect }: { selected: string; events: AgendaEvent[]; onSelect: (date: string) => void }) {
  return <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-6 lg:grid-cols-7">
    {weekDates(selected).map(value => {
      const items = events.filter(event => event.date === value)
      const active = selected === value
      return <button key={value} onClick={() => onSelect(value)} aria-pressed={active} className={`min-h-40 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md ${active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-orange-100 bg-white'}`}>
        <p className="text-xs font-extrabold uppercase tracking-wide text-stone-500">{new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(fromIso(value))}</p>
        <p className="mt-1 font-display text-3xl font-extrabold text-ink">{fromIso(value).getDate()}</p>
        <div className="mt-4 space-y-2">{items.slice(0, 3).map(item => <span key={item.id} className="flex items-center gap-2 text-xs font-semibold text-stone-600"><span className={`size-2 shrink-0 rounded-full ${eventStyle[item.type].dot}`}/><span className="truncate">{item.title}</span></span>)}</div>
      </button>
    })}
  </div>
}
