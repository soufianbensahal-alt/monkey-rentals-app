import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Car, Layers, Paperclip, Pencil, Plus, ReceiptText } from 'lucide-react'
import { Badge, ConfirmButton, EmptyState, PageHeader, StatCard } from '../components/ui'
import { ExpenseEditor } from '../components/ExpenseEditor'
import { ListPagination } from '../components/ListPagination'
import { useFleet } from '../store/FleetContext'
import { date, euroWithCents as euro } from '../lib/format'
import { usePagination } from '../lib/pagination'
import { vehicleLabel } from '../lib/vehicles'
import { blankExpense, deleteExpense, emptyExpenseFilters, expenseCategories, expenseDetail, filterExpenses, summarizeExpenses, useExpenses, type Expense, type ExpenseCategory, type ExpenseFilters, type VehicleFilter } from '../lib/expenses'

export default function ExpensesPage() {
  const { state, ownerId, remoteEnabled } = useFleet()
  const [params] = useSearchParams()
  const { expenses, status, error, reload } = useExpenses(ownerId)
  const [filters, setFilters] = useState<ExpenseFilters>(() => ({ ...emptyExpenseFilters, vehicle: params.get('vehicle') ? `vehicle:${params.get('vehicle')}` : 'todos' }))
  const [editing, setEditing] = useState<Expense | null>(null)
  const [actionError, setActionError] = useState('')
  const rows = useMemo(() => filterExpenses(expenses, filters), [expenses, filters])
  const month = useMemo(() => summarizeExpenses(expenses).monthTotal, [expenses])
  const summary = useMemo(() => summarizeExpenses(rows), [rows])
  const pagination = usePagination(rows, 20)
  const set = (patch: Partial<ExpenseFilters>) => setFilters(current => ({ ...current, ...patch }))
  const filtered = JSON.stringify(filters) !== JSON.stringify(emptyExpenseFilters)
  const vehicleName = (id?: string) => { if (!id) return undefined; const vehicle = state.vehicles.find(item => item.id === id); return vehicle ? `${vehicle.plate} · ${vehicleLabel(vehicle)}` : 'Vehículo eliminado' }
  const remove = async (expense: Expense) => { setActionError(''); try { await deleteExpense(expense) } catch (problem) { setActionError(problem instanceof Error ? problem.message : 'No se ha podido eliminar el gasto.') } }
  const add = () => setEditing(blankExpense(filters.vehicle.startsWith('vehicle:') ? filters.vehicle.slice(8) : undefined))

  if (!remoteEnabled || !ownerId) return <div className="fade-up"><PageHeader eyebrow="Finanzas" title="Gastos" description="Registra gastos de la flota y de cada vehículo."/><div className="card"><EmptyState title="Conecta tu cuenta para usar Gastos." description="Los gastos y sus tickets se guardan de forma privada en tu cuenta de Supabase."/></div></div>

  return <div className="fade-up">
    <PageHeader eyebrow="Finanzas" title="Gastos" description="Material, combustible, desplazamientos, trámites y compras de la flota o de cada vehículo." action={<button className="btn-primary" onClick={add}><Plus size={18}/> Añadir gasto</button>}/>
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label="Total del mes" value={euro.format(month)} detail="Gastos del mes en curso" icon={CalendarDays}/>
      <StatCard label="Vinculados a vehículos" value={euro.format(summary.linked)} detail={filtered ? 'Según los filtros aplicados' : 'Total registrado'} icon={Car} tone="blue"/>
      <StatCard label="Genéricos de flota" value={euro.format(summary.generic)} detail={filtered ? 'Según los filtros aplicados' : 'Total registrado'} icon={Layers} tone="green"/>
    </div>
    <section className="card mt-5 p-5" aria-label="Total por categoría">
      <h2 className="font-display text-lg font-bold">Total por categoría</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{(Object.keys(expenseCategories) as ExpenseCategory[]).map(key => <div key={key} className="rounded-xl bg-brand-50 p-3"><p className="text-xs text-stone-500">{expenseCategories[key]}</p><p className="mt-1 font-bold tabular-nums">{euro.format(summary.byCategory[key])}</p></div>)}</div>
    </section>
    <div className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label><span className="label">Categoría</span><select className="field" value={filters.category} onChange={e => set({ category: e.target.value as ExpenseFilters['category'] })}><option value="todas">Todas</option>{Object.entries(expenseCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span className="label">Vehículo</span><select className="field" value={filters.vehicle} onChange={e => set({ vehicle: e.target.value as VehicleFilter })}><option value="todos">Todos los gastos</option><option value="genericos">Solo genéricos de flota</option><option value="vinculados">Solo vinculados a vehículos</option>{state.vehicles.map(vehicle => <option key={vehicle.id} value={`vehicle:${vehicle.id}`}>{vehicle.plate} · {vehicleLabel(vehicle)}</option>)}</select></label>
      <label><span className="label">Desde</span><input className="field" type="date" value={filters.from} onChange={e => set({ from: e.target.value })}/></label>
      <label><span className="label">Hasta</span><input className="field" type="date" value={filters.to} onChange={e => set({ to: e.target.value })}/></label>
    </div>
    {(error || actionError) && <p role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{actionError || error}{error && !actionError && <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={() => void reload()}>Reintentar</button>}</p>}
    <div className="table-shell">{status === 'loading' && !expenses.length ? <div className="grid min-h-40 place-items-center"><div className="size-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" role="status" aria-label="Cargando gastos"/></div>
      : rows.length ? <><table className="data-table"><thead><tr><th>Fecha</th><th>Gasto</th><th>Vehículo</th><th>Proveedor</th><th>Importe</th><th>Acciones</th></tr></thead><tbody>{pagination.visible.map(expense => {
        const detail = expenseDetail(expense)
        return <tr key={expense.id}>
          <td className="whitespace-nowrap">{date(expense.date)}</td>
          <td><Badge tone="info">{expenseCategories[expense.category]}</Badge><span className="mt-1 block max-w-xs text-sm text-ink">{expense.description || 'Sin descripción'}</span>{detail && <span className="block text-xs text-stone-500">{detail}</span>}</td>
          <td>{vehicleName(expense.vehicleId) || <span className="text-stone-500">Genérico de flota</span>}</td>
          <td>{expense.supplier || '—'}</td>
          <td className="font-bold tabular-nums">{euro.format(expense.amount)}{expense.attachment && <Paperclip size={14} className="ml-1 inline text-stone-500" aria-label="Con ticket adjunto"/>}</td>
          <td><div className="flex items-center gap-4"><button onClick={() => setEditing(expense)} aria-label={`Editar gasto del ${date(expense.date)}`} className="text-stone-500 hover:text-brand-600"><Pencil size={18}/></button><ConfirmButton title="Eliminar gasto" message="¿Seguro que quieres eliminar este gasto? También se eliminará su ticket adjunto." onConfirm={() => void remove(expense)}/></div></td>
        </tr>
      })}</tbody></table><ListPagination page={pagination.page} pages={pagination.pages} total={pagination.total} onPage={pagination.setPage}/></>
      : expenses.length ? <EmptyState title="No hay gastos que coincidan." description="Ajusta los filtros para ver más resultados." action={<button className="btn-secondary" onClick={() => setFilters(emptyExpenseFilters)}>Quitar filtros</button>}/>
      : <EmptyState title="Todavía no hay gastos registrados." description="Añade el primer gasto de la flota o de un vehículo." action={<button className="btn-primary" onClick={add}><Plus size={18}/> Añadir gasto</button>}/>}</div>
    {editing && <ExpenseEditor expense={editing} onClose={() => setEditing(null)}/>}
    <p className="mt-3 flex items-center gap-2 text-xs text-stone-500"><ReceiptText size={14}/> Ordenados por fecha, del más reciente al más antiguo.</p>
  </div>
}
