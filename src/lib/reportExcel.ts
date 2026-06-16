import { economicMovements, type EconomicMovement } from './reports'
import type { FleetState } from '../types'
import type { Row, Sheet } from 'write-excel-file/browser'

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
    fecha: item.date,
    tipo: item.kind === 'ingreso' ? 'Ingreso' : 'Gasto',
    categoria: item.category,
    vehiculo: vehicleName(item.vehicleId),
    cliente: customerName(item.customerId),
    estado: item.status,
    importe: item.amount,
  }))
}

export async function downloadReportExcel(state: FleetState, today?: string) {
  const data = buildReportExcelData(state, today)
  if (!data.hasData) return false
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const vehicles = new Map(state.vehicles.map(item => [item.id, `${item.brand} ${item.model}`.trim() || item.category || item.plate]))
  const customers = new Map(state.customers.map(item => [item.id, item.name]))
  const vehicleName = (id?: string) => id ? vehicles.get(id) || 'Sin datos' : 'Sin datos'
  const customerName = (id?: string) => id ? customers.get(id) || 'Sin datos' : 'Sin datos'

  const header = (labels: string[]): Row => labels.map(value => ({ value, fontWeight:'bold', backgroundColor:'#f97316', textColor:'#ffffff' }))
  const text = (value: string | number) => ({ value: String(value || 'Sin datos') })
  const money = (value: number) => ({ value, type:Number, format:'#,##0.00 €' })
  const summaryRows = [
    ['Pagos cobrados', data.summary.paidIncome],
    ['Pagos pendientes', data.summary.pendingIncome],
    ['Gastos de mantenimiento', data.summary.maintenanceExpenses],
    ['Gastos de impuestos', data.summary.taxExpenses],
    ['Total general de ingresos', data.summary.totalIncome],
    ['Total general de gastos', data.summary.totalExpenses],
    ['Balance final', data.summary.finalBalance],
  ].map(([concept, total]) => [text(concept), money(Number(total))])
  const totalRows = data.categoryTotals.map(item => [text(item.category), money(item.total)])
  const movementSheet = (items: EconomicMovement[]) => [
    header(['Fecha', 'Tipo', 'Categoría', 'Vehículo', 'Cliente', 'Estado', 'Importe']),
    ...movementRows(items, vehicleName, customerName).map(item => [
      text(item.fecha),
      text(item.tipo),
      text(item.categoria),
      text(item.vehiculo),
      text(item.cliente),
      text(item.estado),
      money(item.importe),
    ]),
  ]

  const sheets: Sheet<Blob>[] = [
    { sheet:'Resumen', data:[header(['Concepto', 'Total']), ...summaryRows] },
    { sheet:'Totales categoría', data:[header(['Categoría', 'Total']), ...totalRows] },
    { sheet:'Pagos cobrados', data:movementSheet(data.paidPayments) },
    { sheet:'Pagos pendientes', data:movementSheet(data.pendingPayments) },
    { sheet:'Mantenimiento', data:movementSheet(data.maintenanceExpenses) },
    { sheet:'Impuestos', data:movementSheet(data.taxExpenses) },
  ]
  await writeXlsxFile(sheets).toFile(REPORT_EXCEL_FILENAME)
  return true
}
