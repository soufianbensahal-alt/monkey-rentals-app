import { useEffect, useSyncExternalStore } from 'react'
import { getRemoteOwnerId, privateTable, readRemoteSession } from './remoteStore'
import { removePrivateObjects, uploadPrivateObject } from './privateFiles'
import { uid } from './format'
import type { PrivateFile } from '../types'

export type ExpenseCategory = 'material' | 'combustible' | 'desplazamientos' | 'tramites' | 'compra_vehiculo' | 'otros'
export type TravelType = 'vuelo' | 'tren' | 'taxi' | 'otro'
export type ProcedureType = 'cambio_nombre' | 'transferencia' | 'gestoria'

export interface Expense {
  id: string
  date: string
  amount: number
  category: ExpenseCategory
  description: string
  supplier?: string
  vehicleId?: string
  liters?: number
  odometerKm?: number
  travelType?: TravelType
  procedureType?: ProcedureType
  attachment?: PrivateFile
  createdAt: string
}

export const expenseCategories: Record<ExpenseCategory, string> = {
  material: 'Material / herramientas',
  combustible: 'Combustible',
  desplazamientos: 'Desplazamientos',
  tramites: 'Trámites',
  compra_vehiculo: 'Compra de vehículo',
  otros: 'Otros',
}
export const travelTypes: Record<TravelType, string> = { vuelo: 'Vuelo', tren: 'Tren', taxi: 'Taxi', otro: 'Otro' }
export const procedureTypes: Record<ProcedureType, string> = { cambio_nombre: 'Cambio de nombre', transferencia: 'Transferencia', gestoria: 'Gestoría' }

interface ExpenseRow {
  id: string; user_id: string; date: string; amount: number | string; category: ExpenseCategory; description: string; supplier: string | null; vehicle_id: string | null
  liters: number | string | null; odometer_km: number | null; travel_type: TravelType | null; procedure_type: ProcedureType | null
  attachment_name: string | null; attachment_path: string | null; attachment_thumbnail_path: string | null; attachment_mime: string | null; attachment_size: number | null
  created_at: string; updated_at?: string
}

const optionalNumber = (value: number | string | null) => value === null || value === '' ? undefined : Number(value)

export function fromRow(row: ExpenseRow): Expense {
  const mime = row.attachment_mime || ''
  return {
    id: row.id, date: row.date, amount: Number(row.amount), category: row.category, description: row.description || '',
    supplier: row.supplier || undefined, vehicleId: row.vehicle_id || undefined,
    liters: optionalNumber(row.liters), odometerKm: optionalNumber(row.odometer_km),
    travelType: row.travel_type || undefined, procedureType: row.procedure_type || undefined,
    attachment: row.attachment_path ? { id: row.id, fileName: row.attachment_name || 'Ticket', path: row.attachment_path, thumbnailPath: row.attachment_thumbnail_path || undefined, size: row.attachment_size || 0, mimeType: mime, kind: mime === 'application/pdf' ? 'pdf' : 'image', uploadedAt: row.created_at } : undefined,
    createdAt: row.created_at,
  }
}

// Drops extra fields that do not belong to the category, mirroring the table's check constraints.
export function normalizeExpense(expense: Expense): Expense {
  return {
    ...expense,
    description: expense.description.trim(),
    supplier: expense.supplier?.trim() || undefined,
    liters: expense.category === 'combustible' ? expense.liters : undefined,
    odometerKm: expense.category === 'combustible' ? expense.odometerKm : undefined,
    travelType: expense.category === 'desplazamientos' ? expense.travelType : undefined,
    procedureType: expense.category === 'tramites' ? expense.procedureType : undefined,
  }
}

export function toRow(expense: Expense, userId: string): Omit<ExpenseRow, 'created_at'> & { created_at?: string } {
  const e = normalizeExpense(expense)
  return {
    id: e.id, user_id: userId, date: e.date, amount: Math.round(e.amount * 100) / 100, category: e.category, description: e.description,
    supplier: e.supplier ?? null, vehicle_id: e.vehicleId ?? null, liters: e.liters ?? null, odometer_km: e.odometerKm ?? null,
    travel_type: e.travelType ?? null, procedure_type: e.procedureType ?? null,
    attachment_name: e.attachment?.fileName ?? null, attachment_path: e.attachment?.path ?? null, attachment_thumbnail_path: e.attachment?.thumbnailPath ?? null,
    attachment_mime: e.attachment?.mimeType ?? null, attachment_size: e.attachment?.size ?? null,
    created_at: e.createdAt || undefined, updated_at: new Date().toISOString(),
  }
}

export function validateExpense(expense: Expense): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense.date)) return 'Indica la fecha del gasto.'
  if (!Number.isFinite(expense.amount) || expense.amount <= 0 || expense.amount > 10_000_000) return 'Introduce un importe mayor que cero.'
  if (!Object.hasOwn(expenseCategories, expense.category)) return 'Selecciona una categoría.'
  if (expense.description.length > 2000 || (expense.supplier?.length || 0) > 200) return 'Acorta la descripción o el proveedor.'
  if ([expense.liters, expense.odometerKm].some(value => value !== undefined && (!Number.isFinite(value) || value < 0))) return 'Litros y km deben ser números positivos.'
  if (expense.odometerKm !== undefined && !Number.isInteger(expense.odometerKm)) return 'Los km deben ser un número entero.'
}

// Session-wide cache: the list is fetched once per account and updated locally after each change.
let cache: { owner: string | null; items: Expense[]; status: 'idle' | 'loading' | 'ready' | 'error'; error: string } = { owner: null, items: [], status: 'idle', error: '' }
const listeners = new Set<() => void>()
const emit = (next: Partial<typeof cache>) => { cache = { ...cache, ...next }; listeners.forEach(listener => listener()) }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const sortExpenses = (items: Expense[]) => [...items].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
const ownerId = () => {
  const owner = getRemoteOwnerId(readRemoteSession())
  if (!owner) throw new Error('Inicia sesión para gestionar los gastos.')
  return owner
}

export async function loadExpenses(force = false) {
  const owner = getRemoteOwnerId(readRemoteSession())
  if (!owner) { emit({ owner: null, items: [], status: 'idle', error: '' }); return }
  if (!force && cache.owner === owner && (cache.status === 'ready' || cache.status === 'loading')) return
  emit({ owner, items: cache.owner === owner ? cache.items : [], status: 'loading', error: '' })
  try {
    const response = await privateTable('expenses', '?select=*&order=date.desc,created_at.desc')
    const rows = await response.json() as ExpenseRow[]
    if (cache.owner === owner) emit({ items: sortExpenses(rows.map(fromRow)), status: 'ready' })
  } catch {
    if (cache.owner === owner) emit({ status: 'error', error: 'No se han podido cargar los gastos. Comprueba la conexión.' })
  }
}

export function useExpenses(ownerKey: string | null) {
  const snapshot = useSyncExternalStore(subscribe, () => cache)
  useEffect(() => { void loadExpenses() }, [ownerKey])
  const current = snapshot.owner === ownerKey
  return { expenses: current ? snapshot.items : [], status: current ? snapshot.status : 'loading' as const, error: current ? snapshot.error : '', reload: () => loadExpenses(true) }
}

export interface SaveExpenseOptions { file?: File | null; removeAttachment?: boolean }

export async function saveExpense(input: Expense, { file, removeAttachment = false }: SaveExpenseOptions = {}): Promise<Expense> {
  const owner = ownerId()
  const problem = validateExpense(input)
  if (problem) throw new Error(problem)
  const previous = input.attachment
  const uploaded = file ? await uploadPrivateObject(file, 'expense', input.id) : undefined
  const expense = normalizeExpense({ ...input, attachment: uploaded || (removeAttachment ? undefined : previous), createdAt: input.createdAt || new Date().toISOString() })
  try {
    await privateTable('expenses', '?on_conflict=id', { method: 'POST', body: JSON.stringify([toRow(expense, owner)]) })
  } catch {
    if (uploaded) await removePrivateObjects(uploaded, 'expense').catch(() => {})
    throw new Error('No se ha podido guardar el gasto. Comprueba la conexión y vuelve a intentarlo.')
  }
  if (previous && previous.path !== expense.attachment?.path) await removePrivateObjects(previous, 'expense').catch(() => {})
  if (cache.owner === owner) emit({ items: sortExpenses([...cache.items.filter(item => item.id !== expense.id), expense]) })
  return expense
}

export async function deleteExpense(expense: Expense) {
  const owner = ownerId()
  try {
    await privateTable('expenses', `?id=eq.${encodeURIComponent(expense.id)}`, { method: 'DELETE' })
  } catch {
    throw new Error('No se ha podido eliminar el gasto. Comprueba la conexión y vuelve a intentarlo.')
  }
  if (expense.attachment) await removePrivateObjects(expense.attachment, 'expense').catch(() => {})
  if (cache.owner === owner) emit({ items: cache.items.filter(item => item.id !== expense.id) })
}

export type VehicleFilter = 'todos' | 'genericos' | 'vinculados' | `vehicle:${string}`
export interface ExpenseFilters { category: ExpenseCategory | 'todas'; vehicle: VehicleFilter; from: string; to: string }
export const emptyExpenseFilters: ExpenseFilters = { category: 'todas', vehicle: 'todos', from: '', to: '' }

export function filterExpenses(expenses: Expense[], filters: ExpenseFilters) {
  return sortExpenses(expenses.filter(expense =>
    (filters.category === 'todas' || expense.category === filters.category)
    && (filters.vehicle === 'todos'
      || (filters.vehicle === 'genericos' && !expense.vehicleId)
      || (filters.vehicle === 'vinculados' && !!expense.vehicleId)
      || filters.vehicle === `vehicle:${expense.vehicleId}`)
    && (!filters.from || expense.date >= filters.from)
    && (!filters.to || expense.date <= filters.to)))
}

const cents = (value: number) => Math.round(value * 100)
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }
export const blankExpense = (vehicleId?: string): Expense => ({ id: uid('exp'), date: localToday(), amount: Number.NaN, category: 'material', description: '', vehicleId, createdAt: '' })
export const localMonth = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
export function summarizeExpenses(expenses: Expense[], month = localMonth()) {
  const byCategory = Object.fromEntries(Object.keys(expenseCategories).map(key => [key, 0])) as Record<ExpenseCategory, number>
  let monthTotal = 0, linked = 0, generic = 0, total = 0
  for (const expense of expenses) {
    const amount = cents(expense.amount)
    total += amount
    byCategory[expense.category] += amount
    if (expense.date.startsWith(month)) monthTotal += amount
    if (expense.vehicleId) linked += amount
    else generic += amount
  }
  for (const key of Object.keys(byCategory) as ExpenseCategory[]) byCategory[key] /= 100
  return { total: total / 100, monthTotal: monthTotal / 100, linked: linked / 100, generic: generic / 100, byCategory }
}

export function expenseDetail(expense: Expense) {
  return [
    expense.travelType && travelTypes[expense.travelType],
    expense.procedureType && procedureTypes[expense.procedureType],
    expense.liters !== undefined && `${expense.liters.toLocaleString('es-ES')} L`,
    expense.odometerKm !== undefined && `${expense.odometerKm.toLocaleString('es-ES')} km`,
  ].filter(Boolean).join(' · ')
}
