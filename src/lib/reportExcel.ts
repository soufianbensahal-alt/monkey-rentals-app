import { economicMovements, type EconomicMovement } from './reports'
import type { FleetState } from '../types'

export const reportExcelFilename = (today: string) => `monkey-rentals-informe-${today}.xlsx`

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
    hasData: [state.vehicles, state.customers, state.rentals, state.payments, state.maintenance, state.documents, state.taxes, state.fines, state.clientDocuments].some(items => items.length > 0),
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

// FleetContext supplies only the current owner's state. No extra remote reads or caches.
export async function downloadReportExcel(state: FleetState, today = new Date().toISOString().slice(0, 10), generatedBy?: string) {
  const [{ default: writeXlsxFile }, { buildReportWorkbook, reportFilters }] = await Promise.all([
    import('write-excel-file/browser'),
    import('./reportWorkbook'),
  ])
  const sheets = buildReportWorkbook(state, today, generatedBy)
  await writeXlsxFile(sheets, { fontFamily: 'Calibri', fontSize: 11, features: [reportFilters(sheets)] }).toFile(reportExcelFilename(today))
  return true
}
