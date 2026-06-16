import { economicMovements, type EconomicMovement } from './reports'
import type { FleetState } from '../types'

export const REPORT_EXCEL_FILENAME = 'monkey-rentals-informe.xlsx'

export interface ReportExcelSummary {
  paidIncome: number
  pendingIncome: number
  maintenanceExpenses: number
  taxExpenses: number
  totalIncome: number
  totalExpenses: number
  finalBalance: number
}

export interface ReportExcelData {
  hasData: boolean
  summary: ReportExcelSummary
  categoryTotals: Array<{ category: string; total: number }>
  paidPayments: EconomicMovement[]
  pendingPayments: EconomicMovement[]
  maintenanceExpenses: EconomicMovement[]
  taxExpenses: EconomicMovement[]
  movements: EconomicMovement[]
}

const isRealizedExpense = (item: EconomicMovement) => item.kind === 'gasto' && (item.status === 'pagado' || item.status === 'registrado')
const isMaintenanceExpense = (item: EconomicMovement) => item.category === 'Mantenimiento' || item.category === 'Reparaciones'
const byDateDesc = (a: EconomicMovement, b: EconomicMovement) => b.date.localeCompare(a.date)

export function buildReportExcelData(state: FleetState, today = new Date().toISOString().slice(0, 10)): ReportExcelData {
  const movements = economicMovements(state, today).sort(byDateDesc)
  const paidPayments = movements.filter(item => item.kind === 'ingreso' && item.status === 'pagado')
  const pendingPayments = movements.filter(item => item.kind === 'ingreso' && item.status !== 'pagado')
  const realizedExpenses = movements.filter(isRealizedExpense)
  const maintenanceExpenses = realizedExpenses.filter(isMaintenanceExpense)
  const taxExpenses = realizedExpenses.filter(item => item.category === 'Impuestos')
  const categoryMap = realizedExpenses.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + item.amount
    return acc
  }, {})
  const categoryTotals = Object.entries(categoryMap)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
  const paidIncome = paidPayments.reduce((sum, item) => sum + item.amount, 0)
  const pendingIncome = pendingPayments.reduce((sum, item) => sum + item.amount, 0)
  const totalExpenses = realizedExpenses.reduce((sum, item) => sum + item.amount, 0)
  const totalIncome = paidIncome
  return {
    hasData: movements.length > 0,
    summary: {
      paidIncome,
      pendingIncome,
      maintenanceExpenses: maintenanceExpenses.reduce((sum, item) => sum + item.amount, 0),
      taxExpenses: taxExpenses.reduce((sum, item) => sum + item.amount, 0),
      totalIncome,
      totalExpenses,
      finalBalance: totalIncome - totalExpenses,
    },
    categoryTotals,
    paidPayments,
    pendingPayments,
    maintenanceExpenses,
    taxExpenses,
    movements,
  }
}

function movementRows(items: EconomicMovement[], vehicleName: (id?: string) => string, customerName: (id?: string) => string) {
  return items.map(item => ({
    Fecha: item.date,
    Tipo: item.kind === 'ingreso' ? 'Ingreso' : 'Gasto',
    Categoría: item.category,
    Vehículo: vehicleName(item.vehicleId),
    Cliente: customerName(item.customerId),
    Estado: item.status,
    Importe: item.amount,
  }))
}

export async function downloadReportExcel(state: FleetState, today?: string) {
  const data = buildReportExcelData(state, today)
  if (!data.hasData) return false
  const XLSX = await import('xlsx')
  const vehicles = new Map(state.vehicles.map(item => [item.id, `${item.brand} ${item.model}`.trim() || item.category || item.plate]))
  const customers = new Map(state.customers.map(item => [item.id, item.name]))
  const vehicleName = (id?: string) => id ? vehicles.get(id) || 'Sin datos' : 'Sin datos'
  const customerName = (id?: string) => id ? customers.get(id) || 'Sin datos' : 'Sin datos'

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { Concepto: 'Pagos cobrados', Total: data.summary.paidIncome },
    { Concepto: 'Pagos pendientes', Total: data.summary.pendingIncome },
    { Concepto: 'Gastos de mantenimiento', Total: data.summary.maintenanceExpenses },
    { Concepto: 'Gastos de impuestos', Total: data.summary.taxExpenses },
    { Concepto: 'Total general de ingresos', Total: data.summary.totalIncome },
    { Concepto: 'Total general de gastos', Total: data.summary.totalExpenses },
    { Concepto: 'Balance final', Total: data.summary.finalBalance },
  ]), 'Resumen')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.categoryTotals), 'Totales categoría')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(movementRows(data.paidPayments, vehicleName, customerName)), 'Pagos cobrados')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(movementRows(data.pendingPayments, vehicleName, customerName)), 'Pagos pendientes')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(movementRows(data.maintenanceExpenses, vehicleName, customerName)), 'Mantenimiento')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(movementRows(data.taxExpenses, vehicleName, customerName)), 'Impuestos')
  XLSX.writeFile(workbook, REPORT_EXCEL_FILENAME, { compression: true })
  return true
}
