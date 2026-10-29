import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useFleet } from '../store/FleetContext'
import { blankExpense, expenseCategories, summarizeExpenses, useExpenses, type Expense } from '../lib/expenses'
import { date, euroWithCents as euro } from '../lib/format'
import { ExpenseEditor } from './ExpenseEditor'

export function VehicleExpenses({ vehicleId }: { vehicleId: string }) {
  const { ownerId, remoteEnabled } = useFleet()
  const { expenses, status } = useExpenses(ownerId)
  const [editing, setEditing] = useState<Expense | null>(null)
  const linked = useMemo(() => expenses.filter(expense => expense.vehicleId === vehicleId), [expenses, vehicleId])
  const total = useMemo(() => summarizeExpenses(linked).total, [linked])
  if (!remoteEnabled || !ownerId) return null
  return <section className="mt-5 rounded-xl border border-orange-100 p-4" aria-label="Gastos del vehículo">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-bold">Gastos del vehículo</h3><p className="text-sm text-stone-500">{status === 'loading' && !linked.length ? 'Cargando…' : `${linked.length} ${linked.length === 1 ? 'gasto' : 'gastos'} · ${euro.format(total)}`}</p></div>
      <button type="button" className="btn-secondary min-h-10 px-3 text-xs" onClick={() => setEditing(blankExpense(vehicleId))}><Plus size={16}/> Añadir gasto</button>
    </div>
    {linked.length > 0 && <ul className="mt-3 divide-y divide-orange-100 text-sm">{linked.slice(0, 5).map(expense => <li key={expense.id} className="flex items-center justify-between gap-3 py-2">
      <button type="button" className="min-w-0 text-left" onClick={() => setEditing(expense)}><span className="block font-semibold">{expenseCategories[expense.category]}</span><span className="block truncate text-xs text-stone-500">{date(expense.date)}{expense.description ? ` · ${expense.description}` : ''}</span></button>
      <span className="shrink-0 font-bold tabular-nums">{euro.format(expense.amount)}</span>
    </li>)}</ul>}
    {linked.length > 0 && <Link className="mt-2 inline-block text-sm font-bold text-brand-600" to={`/app/gastos?vehicle=${encodeURIComponent(vehicleId)}`}>Ver todos en Gastos</Link>}
    {editing && <ExpenseEditor expense={editing} onClose={() => setEditing(null)}/>}
  </section>
}
