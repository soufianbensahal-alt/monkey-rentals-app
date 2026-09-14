import { describe, expect, it } from 'vitest'
import type { CellObject } from 'write-excel-file/browser'
import { emptyState } from '../data/emptyState'
import { buildReportWorkbook, reportFilters, type ReportSheet } from './reportWorkbook'
import { buildReport } from './reports'
import { reportExcelFilename } from './reportExcel'

const today = '2026-09-13'
function fixture() {
  const state = structuredClone(emptyState)
  state.vehicles = [{ id:'v1', plate:'0123ABC', brand:'Ford', model:'Transit', category:'Furgoneta', year:2022, dailyRate:40, weeklyRate:250, monthlyRate:700, includedKmPerDay:125, extraKmRate:0.15, status:'mantenimiento', notes:'Vehículo principal' }]
  state.customers = [{ id:'c1', name:'Ana', email:'ana@example.test', phone:'0034123456789', dni:'00123X', rentals:99 }]
  state.rentals = [{ id:'r1', vehicleId:'v1', customerId:'c1', startDate:'2026-08-01', agreedPrice:600, pricePeriod:'mes', expectedKilometers:0, status:'activo', notes:'Contrato' }]
  state.payments = [
    { id:'paid', rentalId:'r1', dueDate:'2026-09-01', paidDate:'2026-09-02', amount:600.25, status:'pagado', method:'Tarjeta', notes:'=HYPERLINK("https://example.test")' },
    { id:'late', rentalId:'r1', dueDate:'2026-09-01', amount:200, status:'pendiente', notes:'' },
    { id:'pending', rentalId:'r1', dueDate:'2026-10-01', amount:400, status:'pendiente', reminderEnabled:true, reminderDate:'2026-10-01', reminderFrequency:'monthly', notes:'' },
    { id:'flex', rentalId:'r1', dueDate:'2026-09-05', amount:50, status:'flexible', notes:'' },
    { id:'cancel', rentalId:'r1', dueDate:'2026-09-01', amount:999, status:'cancelado', notes:'' },
  ]
  state.maintenance = [{ id:'m1', vehicleId:'v1', date:'2026-09-03', type:'Reparación motor', cost:100, status:'completado', notes:'' }]
  state.documents = [{ id:'d1', vehicleId:'v1', type:'ITV', expiryDate:'2026-09-30', cost:45, paymentStatus:'pagado', paidDate:'2026-09-04', notes:'' }]
  state.taxes = [{ id:'t1', vehicleId:'v1', concept:'IVTM', dueDate:'2026-10-20', amount:60, status:'pendiente', notes:'' }]
  state.fines = [{ id:'f1', vehicleId:'v1', customerId:'c1', infractionDate:'2026-09-04', amount:30, status:'cargada al cliente', concept:'Aparcamiento', notes:'' }]
  return state
}
const values = (sheet: ReportSheet) => sheet.data.map(row => row.map(cell => (cell as CellObject)?.value))
const sheet = (sheets: ReportSheet[], name: string) => sheets.find(s => s.sheet === name)!
const total = (s: ReportSheet, label: string) => values(s).find(row => row[0] === label)?.filter(value => value !== undefined).at(-1)

describe('Excel completo de Informes', () => {
  it('incluye las 12 hojas y reconcilia los indicadores con Informes sin duplicar flexibles', () => {
    const state = fixture()
    const snapshot = structuredClone(state)
    const sheets = buildReportWorkbook(state, today, 'owner@example.test')
    expect(sheets.map(s => s.sheet)).toEqual(['Resumen', 'Ingresos', 'Pagos pendientes', 'Pagos atrasados', 'Gastos', 'Vehículos', 'Clientes', 'Alquileres', 'Mantenimiento', 'ITV y documentación', 'Multas e impuestos', 'Últimos movimientos'])
    const summary = sheet(sheets, 'Resumen')
    const report = buildReport(state, today)
    expect(total(summary, 'Ingresos cobrados')).toBe(report.summary.totalPaid)
    expect(total(summary, 'Ingresos pendientes')).toBe(450)
    expect(total(summary, 'Dinero atrasado')).toBe(200)
    expect(total(summary, 'Gastos del mes')).toBe(145)
    expect(total(summary, 'Beneficio estimado del mes')).toBe(455.25)
    expect(total(summary, 'Generado por')).toBe('owner@example.test')
    expect(total(sheet(sheets, 'Ingresos'), 'Total general (sin duplicar flexibles)')).toBe(1250.25)
    expect(state).toEqual(snapshot)
  })

  it('usa fechas y moneda reales, texto seguro, estados calculados y contactos intactos', () => {
    const sheets = buildReportWorkbook(fixture(), today)
    const income = sheet(sheets, 'Ingresos')
    const paid = income.data.find(row => (row[7] as CellObject)?.value === 'Tarjeta')!
    expect(paid[0]).toMatchObject({ type: Date, value: new Date('2026-09-02T00:00:00Z'), format:'dd/mm/yyyy' })
    expect(paid[6]).toMatchObject({ type: Number, value:600.25 })
    expect(paid[9]).toMatchObject({ type: String, value:'=HYPERLINK("https://example.test")' })
    expect(values(sheet(sheets, 'Vehículos'))[1][5]).toBe('Alquilado')
    expect(values(sheet(sheets, 'Clientes'))[1][1]).toBe('0034123456789')
    expect(values(sheet(sheets, 'Clientes'))[1][4]).toBe(1)
    expect(values(sheet(sheets, 'Pagos atrasados'))[1][5]).toBe(12)
    expect(total(sheet(sheets, 'Pagos atrasados'), 'Cliente con mayor deuda')).toBe('Ana')
    const pending = values(sheet(sheets, 'Pagos pendientes'))
    expect(pending[1][0]).toEqual(new Date('2026-09-05T00:00:00Z'))
    expect(pending[2][0]).toEqual(new Date('2026-10-01T00:00:00Z'))
    expect(sheets.every(s => s.stickyRowsCount === 1)).toBe(true)
  })

  it('exporta resumen vacío y todas las hojas cuando solo hay datos operativos', () => {
    const state = structuredClone(emptyState)
    const empty = buildReportWorkbook(state, today)
    expect(empty).toHaveLength(1)
    expect(JSON.stringify(empty)).toContain('No hay datos suficientes para generar un informe completo.')
    state.customers = fixture().customers
    const partial = buildReportWorkbook(state, today)
    expect(partial).toHaveLength(12)
    expect(total(sheet(partial, 'Clientes'), 'Total clientes')).toBe(1)
    const debtRow = sheet(partial, 'Resumen').data.find(row => (row[0] as CellObject)?.value === 'Dinero atrasado')!
    expect(debtRow[1]).toMatchObject({ value:0, textColor:'#047857' })
  })

  it('identifica previsiones sin duplicarlas y tolera referencias eliminadas', () => {
    const state = fixture()
    state.payments = []
    state.vehicles = []
    state.customers = []
    const sheets = buildReportWorkbook(state, today)
    expect(total(sheet(sheets, 'Ingresos'), 'Total general (sin duplicar flexibles)')).toBe(600)
    expect(values(sheet(sheets, 'Ingresos'))[1][4]).toBe('Alquiler previsto')
    expect(values(sheet(sheets, 'Ingresos'))[1][2]).toBe('Vehículo eliminado')
  })

  it('no reutiliza datos entre usuarios ni limita movimientos a las 12 filas de pantalla', () => {
    const state = fixture()
    state.payments = Array.from({length:20}, (_, i) => ({...state.payments[0], id:`p${i}`}))
    const first = buildReportWorkbook(state, today, 'first@example.test')
    expect(values(sheet(first, 'Ingresos')).filter(row => row[7] === 'Tarjeta')).toHaveLength(20)
    const other = structuredClone(emptyState)
    other.customers = [{...state.customers[0], name:'Otra cuenta', email:'other@example.test'}]
    const second = buildReportWorkbook(other, today, 'second@example.test')
    expect(JSON.stringify(second)).not.toContain('ana@example.test')
    expect(JSON.stringify(second)).not.toContain('first@example.test')
    expect(reportExcelFilename(today)).toBe('monkey-rentals-informe-2026-09-13.xlsx')
  })

  it('inserta filtros antes de merges y fuera de los totales', () => {
    const sheets = buildReportWorkbook(fixture(), today)
    const index = sheets.findIndex(s => s.sheet === 'Ingresos')
    const transform = reportFilters(sheets).files!.transform!['xl/worksheets/sheet{id}.xml']!.transform!
    const xml = '<worksheet><sheetData/><mergeCells/><pageMargins/></worksheet>'
    const result = transform(xml, sheets[index], {sheetIndex:index, sheetId:String(index + 1)})
    expect(result).toContain('<autoFilter ref="A1:N5"/>')
    expect(result.indexOf('autoFilter')).toBeLessThan(result.indexOf('mergeCells'))
    expect(transform(result, sheets[index], {sheetIndex:index, sheetId:String(index + 1)})).toBe(result)
  })
})
