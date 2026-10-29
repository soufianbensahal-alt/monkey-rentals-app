import { describe, expect, it } from 'vitest'
import { filterExpenses, fromRow, normalizeExpense, summarizeExpenses, toRow, validateExpense, type Expense } from './expenses'

const base = (id: string, patch: Partial<Expense> = {}): Expense => ({ id, date: '2026-10-10', amount: 10, category: 'otros', description: '', createdAt: `2026-10-10T10:00:0${id.length}Z`, ...patch })
const items = [
  base('a', { date: '2026-10-01', amount: 50.1, category: 'combustible', vehicleId: 'v1' }),
  base('bb', { date: '2026-10-20', amount: 20.2, category: 'material' }),
  base('ccc', { date: '2026-09-15', amount: 100, category: 'compra_vehiculo', vehicleId: 'v2' }),
]

describe('Gastos', () => {
  it('filtra por categoría, vehículo, genéricos y fechas y ordena por fecha descendente', () => {
    expect(filterExpenses(items, { category: 'todas', vehicle: 'todos', from: '', to: '' }).map(e => e.id)).toEqual(['bb', 'a', 'ccc'])
    expect(filterExpenses(items, { category: 'combustible', vehicle: 'todos', from: '', to: '' }).map(e => e.id)).toEqual(['a'])
    expect(filterExpenses(items, { category: 'todas', vehicle: 'genericos', from: '', to: '' }).map(e => e.id)).toEqual(['bb'])
    expect(filterExpenses(items, { category: 'todas', vehicle: 'vinculados', from: '', to: '' }).map(e => e.id)).toEqual(['a', 'ccc'])
    expect(filterExpenses(items, { category: 'todas', vehicle: 'vehicle:v2', from: '', to: '' }).map(e => e.id)).toEqual(['ccc'])
    expect(filterExpenses(items, { category: 'todas', vehicle: 'todos', from: '2026-10-01', to: '2026-10-19' }).map(e => e.id)).toEqual(['a'])
  })

  it('resume el mes, las categorías y vinculados frente a genéricos sin errores de redondeo', () => {
    const summary = summarizeExpenses(items, '2026-10')
    expect(summary).toMatchObject({ total: 170.3, monthTotal: 70.3, linked: 150.1, generic: 20.2 })
    expect(summary.byCategory).toMatchObject({ combustible: 50.1, material: 20.2, compra_vehiculo: 100, otros: 0 })
  })

  it('descarta los campos extra que no corresponden a la categoría', () => {
    const expense = normalizeExpense(base('x', { category: 'material', liters: 30, odometerKm: 1000, travelType: 'taxi', procedureType: 'gestoria', supplier: '  ' }))
    expect(expense).toMatchObject({ liters: undefined, odometerKm: undefined, travelType: undefined, procedureType: undefined, supplier: undefined })
    expect(normalizeExpense(base('y', { category: 'combustible', liters: 30, odometerKm: 1000 }))).toMatchObject({ liters: 30, odometerKm: 1000 })
  })

  it('convierte filas de Supabase sin perder el vehículo, el genérico ni el ticket', () => {
    const expense = base('r', { category: 'desplazamientos', travelType: 'vuelo', vehicleId: undefined, attachment: { id: 'r', fileName: 'ticket.pdf', path: 'u/r/f.pdf', size: 10, mimeType: 'application/pdf', kind: 'pdf', uploadedAt: '' } })
    const row = toRow(expense, 'user-a')
    expect(row).toMatchObject({ user_id: 'user-a', vehicle_id: null, travel_type: 'vuelo', attachment_path: 'u/r/f.pdf' })
    expect(fromRow({ ...row, amount: '10.00', created_at: expense.createdAt })).toMatchObject({ amount: 10, vehicleId: undefined, travelType: 'vuelo', attachment: { path: 'u/r/f.pdf', kind: 'pdf' } })
  })

  it('valida fecha, importe y números extra', () => {
    expect(validateExpense(base('v'))).toBeUndefined()
    expect(validateExpense(base('v', { amount: Number.NaN }))).toContain('importe')
    expect(validateExpense(base('v', { amount: 0 }))).toContain('importe')
    expect(validateExpense(base('v', { date: '' }))).toContain('fecha')
    expect(validateExpense(base('v', { category: 'combustible', odometerKm: 10.5 }))).toContain('entero')
  })
})
