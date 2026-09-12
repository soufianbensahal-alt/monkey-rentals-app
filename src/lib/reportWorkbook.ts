import type { CellObject, Feature, Row, Sheet } from 'write-excel-file/browser'
import { findElement, getCellAddress, getOrderOfSiblings, insertElementMarkupAccordingToOrderOfSiblings } from 'write-excel-file/utility'
import type { FleetState, Rental } from '../types'
import { buildReport, economicMovements, type EconomicMovement } from './reports'
import { getVehicleStatusMap } from './vehicleStatus'
import { vehicleLabel } from './vehicles'
import { isFlexiblePayment, paymentReminderLabel, reminderFrequencyLabels } from './paymentReminders'

const colors = { orange: '#F97316', ink: '#164E63', green: '#047857', red: '#B91C1C', muted: '#64748B' }
const currencyFormat = '#,##0.00 "€";[Red]-#,##0.00 "€";0 "€"'
const text = (value?: string): CellObject => ({ type: String, value: value ?? '', wrap: true })
const number = (value: number): CellObject => ({ type: Number, value, format: '#,##0' })
const money = (value: number, color?: string): CellObject => ({ type: Number, value, format: currencyFormat, textColor: color })
const debt = (value: number) => money(value, value === 0 ? colors.green : colors.red)
const profit = (value: number) => money(value, value >= 0 ? colors.green : colors.red)
const date = (value?: string): CellObject => {
  const parsed = value ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : undefined
  return parsed && Number.isFinite(parsed.getTime()) ? { type: Date, value: parsed, format: 'dd/mm/yyyy' } : text()
}
const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const status = (value: string): CellObject => ({ ...text(label(value)), textColor: /atrasad|caducad/.test(value) ? colors.red : /pagad|completad|vigente|finalizado|disponible/.test(value) ? colors.green : colors.muted })
const sum = (items: EconomicMovement[]) => items.reduce((total, item) => total + item.amount, 0)
const realized = (item: EconomicMovement) => item.kind === 'gasto' && ['pagado', 'registrado'].includes(item.status)
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
const header = (labels: string[]): Row => labels.map(value => ({ ...text(value), fontWeight: 'bold', backgroundColor: colors.orange, textColor: '#FFFFFF', height: 34, alignVertical: 'center' }))
const total = (name: string, value: CellObject): Row => [
  { ...text(name), fontWeight: 'bold', backgroundColor: '#FFF7ED', height: 30 },
  { ...value, fontWeight: 'bold', backgroundColor: '#FFF7ED' },
]

export interface ReportSheet extends Sheet<Blob> { data: Row[]; filterRange?: string }

function table(name: string, labels: string[], rows: Row[], totals: Row[] = []): ReportSheet {
  const widths = labels.map((name, column) => ({ width: Math.min(48, Math.max(16, name.length + 2, ...rows.slice(0, 200).map(row => {
    const cell = row[column] as CellObject | undefined
    return typeof cell?.value === 'string' ? Math.min(44, cell.value.length + 2) : 16
  }))) }))
  const body = rows.map((row, index) => {
    const height = Math.min(409, Math.max(34, ...row.map((cell, column) => {
      const value = (cell as CellObject)?.value
      return typeof value === 'string' ? value.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / (widths[column].width - 3))), 0) * 15 + 10 : 34
    })))
    return row.map(cell => ({
      backgroundColor: index % 2 ? '#F1F5F9' : '#FFFFFF', textColor: colors.ink, height, alignVertical: 'center' as const,
      ...(cell as CellObject),
    }))
  })
  const footer = totals.map(row => [
    { ...(row[0] as CellObject), columnSpan: labels.length - 1 },
    ...Array.from({ length: labels.length - 2 }, () => null), row[1],
  ])
  return {
    sheet: name, columns: widths, stickyRowsCount: 1, showGridLines: false, orientation: 'landscape',
    filterRange: rows.length ? `A1:${getCellAddress(rows.length, labels.length - 1)}` : undefined,
    data: [header(labels), ...(body.length ? body : [[text('Sin registros')]]), [], ...footer],
  }
}

// The writer supports extension features. Insert AutoFilter in the OOXML schema order,
// restricting it to source rows so totals cannot be hidden or counted as records.
export function reportFilters<FileContent = File | Blob | ArrayBuffer>(sheets: ReportSheet[]): Feature<FileContent> {
  return { files: { transform: { 'xl/worksheets/sheet{id}.xml': {
    transform(xml, _options, { sheetIndex }) {
      const range = sheets[sheetIndex].filterRange
      if (!range || findElement(xml, 'autoFilter')) return xml
      const order = getOrderOfSiblings('xl/worksheets/sheet{id}.xml', 'worksheet')
      if (!order) throw new Error('No se ha podido configurar el filtro de Excel.')
      return insertElementMarkupAccordingToOrderOfSiblings(xml, `<autoFilter ref="${range}"/>`, order, 'worksheet')
    },
  } } } }
}

export function buildReportWorkbook(state: FleetState, today: string, generatedBy?: string): ReportSheet[] {
  const report = buildReport(state, today)
  const movements = economicMovements(state, today).sort((a, b) => b.date.localeCompare(a.date))
  const incomes = movements.filter(item => item.kind === 'ingreso')
  const pending = incomes.filter(item => item.status === 'pendiente').sort((a, b) => a.date.localeCompare(b.date))
  const overdue = incomes.filter(item => item.status === 'atrasado').sort((a, b) => a.date.localeCompare(b.date))
  const expenses = movements.filter(item => item.kind === 'gasto')
  const paidExpenses = expenses.filter(realized)
  const vehicles = new Map(state.vehicles.map(item => [item.id, item]))
  const customers = new Map(state.customers.map(item => [item.id, item]))
  const rentals = new Map(state.rentals.map(item => [item.id, item]))
  const payments = new Map(state.payments.map(item => [`payment-${item.id}`, item]))
  const sources = new Map<string, { notes: string; concept: string; origin: string }>([
    ...state.payments.map(item => [`payment-${item.id}`, { notes: [item.notes, item.flexibleNotes].filter(Boolean).join('\n'), concept: '', origin: 'Pago' }] as const),
    ...state.rentals.map(item => [`rental-${item.id}`, { notes: item.notes, concept: '', origin: 'Alquiler' }] as const),
    ...state.maintenance.map(item => [`maintenance-${item.id}`, { notes: item.notes, concept: item.type, origin: 'Mantenimiento' }] as const),
    ...state.documents.map(item => [`document-${item.id}`, { notes: item.notes, concept: item.type, origin: /itv/i.test(item.type) ? 'ITV' : 'Documento' }] as const),
    ...state.taxes.map(item => [`tax-${item.id}`, { notes: item.notes, concept: item.concept, origin: 'Impuesto' }] as const),
    ...state.fines.map(item => [`fine-${item.id}`, { notes: item.notes, concept: item.concept, origin: 'Multa' }] as const),
  ])
  const vname = (id?: string) => id ? vehicleLabel(vehicles.get(id)) : ''
  const plate = (id?: string) => id ? vehicles.get(id)?.plate : ''
  const cname = (id?: string) => id ? customers.get(id)?.name || 'Cliente eliminado' : ''
  const relatedRental = (item: EconomicMovement) => payments.get(item.id)?.rentalId || (item.id.startsWith('rental-') ? item.id.slice(7) : '')
  const frequency = (item: EconomicMovement) => {
    const payment = payments.get(item.id)
    if (payment) return paymentReminderLabel(payment)
    return reminderFrequencyLabels[rentals.get(relatedRental(item))?.paymentReminderFrequency || 'none']
  }
  const isActive = (r: Rental) => r.status === 'activo' && r.startDate <= today && (!r.endDate || r.endDate >= today)
  const isReservation = (r: Rental) => ['activo', 'pendiente'].includes(r.status) && r.startDate > today
  const hasData = [state.vehicles, state.customers, state.rentals, state.payments, state.maintenance, state.documents, state.taxes, state.fines, state.clientDocuments].some(items => items.length)
  const summary = report.summary
  const summaryRows: Row[] = [
    header(['Monkey Rentals', 'Informe económico y operativo', '', '', '', '']),
    [text('Fecha de generación'), date(today)],
    [text('Generado por'), text(generatedBy || state.adminSettings.name || state.adminSettings.email)],
    [text('Periodo analizado'), { ...text('Todos los registros disponibles. Los indicadores del mes corresponden al mes de generación.'), columnSpan: 5 }],
    [text('Mes de referencia'), { ...date(`${today.slice(0, 7)}-01`), format: 'mm/yyyy' }],
  ]
  if (!hasData) {
    summaryRows.push([], [{ ...text('No hay datos suficientes para generar un informe completo.'), columnSpan: 6, height: 40 }])
    return [{ sheet: 'Resumen', data: summaryRows, columns: [{ width: 34 }, ...Array.from({ length: 5 }, () => ({ width: 22 }))], stickyRowsCount: 1, showGridLines: false }]
  }
  summaryRows.push([], header(['Indicador', 'Importe / cantidad', '', '', '', '']),
    total('Ingresos cobrados', money(summary.totalPaid, colors.green)),
    total('Ingresos pendientes', money(summary.totalPending)),
    total('Pagos flexibles (incluidos en pendientes)', money(summary.flexiblePending)),
    total('Dinero atrasado', debt(summary.totalOverdue)),
    total('Gastos del mes', money(summary.monthExpenses)),
    total('Beneficio estimado del mes', profit(summary.monthProfit)),
    total('Vehículo con más ingresos', text(summary.topIncomeVehicleId ? `${vname(summary.topIncomeVehicleId)} · ${plate(summary.topIncomeVehicleId)}` : 'Sin cobros registrados')),
    total('Número total de vehículos', number(state.vehicles.length)),
    total('Número de clientes', number(state.customers.length)),
    total('Número de alquileres activos', number(state.rentals.filter(isActive).length)),
    total('Número de pagos pendientes / previsiones', number(pending.length)),
    total('Número de pagos atrasados / previsiones', number(overdue.length)),
    total('Mantenimientos registrados', number(state.maintenance.length)),
    total('Multas registradas', number(state.fines.length)),
    total('Impuestos pendientes', number(state.taxes.filter(item => item.status !== 'pagado').length)),
    [], [{ ...text('Los importes y estados económicos siguen Informes. Las previsiones sin pagos asociados figuran como «Alquiler previsto». Los gastos realizados incluyen mantenimiento registrado y gastos pagados. Los campos no registrados quedan vacíos.'), columnSpan: 6, height: 45 }],
    [], header(['Evolución mensual', 'Cobrado', 'Pendiente', 'Atrasado', 'Gastos realizados', 'Beneficio real']),
    ...report.monthly.map(item => [{ ...date(`${item.month}-01`), format: 'mm/yyyy' }, money(item.paid, colors.green), money(item.pending), debt(item.overdue), money(item.expenses), profit(item.profit)]),
    [], header(['Distribución de gastos realizados', 'Importe']),
    ...report.categories.map(item => [text(item.category), money(item.total)]),
    [], total('Total ingresos cobrados (histórico)', money(summary.totalPaid, colors.green)),
    total('Total gastos realizados (histórico)', money(sum(paidExpenses))),
    total('Beneficio realizado (histórico)', profit(summary.totalPaid - sum(paidExpenses))),
  )
  const sheets: ReportSheet[] = [{ sheet: 'Resumen', data: summaryRows, columns: [{ width: 46 }, { width: 34 }, ...Array.from({ length: 4 }, () => ({ width: 22 }))], stickyRowsCount: 1, showGridLines: false, orientation: 'landscape' }]
  sheets.push(table('Ingresos', ['Fecha de cobro', 'Cliente', 'Vehículo', 'Matrícula', 'Tipo de ingreso', 'Estado', 'Importe', 'Método de pago', 'Alquiler relacionado', 'Notas', 'Fecha prevista de cobro'], incomes.map(item => {
    const payment = payments.get(item.id)
    return [date(payment?.paidDate), text(cname(item.customerId)), text(vname(item.vehicleId)), text(plate(item.vehicleId)), text(item.category), status(item.status), item.status === 'atrasado' ? debt(item.amount) : money(item.amount, item.status === 'pagado' ? colors.green : undefined), text(payment?.method), text(relatedRental(item)), text(sources.get(item.id)?.notes), date(payment?.dueDate || item.date)]
  }), [total('Total ingresos cobrados', money(summary.totalPaid, colors.green)), total('Total ingresos pendientes', money(summary.totalPending)), total('Total ingresos atrasados', debt(summary.totalOverdue)), total('Total pagos flexibles pendientes (incluidos)', money(summary.flexiblePending)), total('Total general (sin duplicar flexibles)', money(summary.totalExpected))]))
  sheets.push(table('Pagos pendientes', ['Fecha prevista de cobro', 'Cliente', 'Vehículo', 'Matrícula', 'Importe pendiente', 'Tipo de pago', 'Frecuencia del recordatorio', 'Próximo recordatorio', 'Días restantes', 'Notas'], pending.map(item => {
    const p = payments.get(item.id)
    const due = p?.dueDate || item.date
    return [date(due), text(cname(item.customerId)), text(vname(item.vehicleId)), text(plate(item.vehicleId)), money(item.amount), text(item.category), text(frequency(item)), date(p?.reminderEnabled ? p.reminderDate : undefined), number(days(today, due)), text(sources.get(item.id)?.notes)]
  }), [total('Total pendiente (incluye flexibles)', money(summary.totalPending)), total('Número de pagos / previsiones', number(pending.length))]))
  const debts = new Map<string, number>()
  for (const item of overdue) if (item.customerId) debts.set(item.customerId, (debts.get(item.customerId) || 0) + item.amount)
  const topDebtor = [...debts].sort((a, b) => b[1] - a[1])[0]
  sheets.push(table('Pagos atrasados', ['Fecha vencida', 'Cliente', 'Vehículo', 'Matrícula', 'Importe atrasado', 'Días de retraso', 'Tipo de pago', 'Teléfono', 'Email', 'Notas'], overdue.map(item => {
    const customer = item.customerId ? customers.get(item.customerId) : undefined
    const due = payments.get(item.id)?.dueDate || item.date
    return [date(due), text(cname(item.customerId)), text(vname(item.vehicleId)), text(plate(item.vehicleId)), debt(item.amount), number(Math.max(0, days(due, today))), text(item.category), text(customer?.phone), text(customer?.email), text(sources.get(item.id)?.notes)]
  }), [total('Total dinero atrasado', debt(summary.totalOverdue)), total('Número de pagos / previsiones atrasados', number(overdue.length)), total('Cliente con mayor deuda', text(topDebtor ? cname(topDebtor[0]) : 'Sin deuda')), ...(topDebtor ? [total('Deuda del cliente', debt(topDebtor[1]))] : [])]))
  const expenseCategory = (item: EconomicMovement) => sources.get(item.id)?.origin === 'Multa' ? 'Multa' : item.category
  sheets.push(table('Gastos', ['Fecha', 'Categoría', 'Vehículo', 'Matrícula', 'Concepto', 'Importe', 'Estado', 'Proveedor o taller', 'Notas'], expenses.map(item => [date(item.date), text(expenseCategory(item)), text(vname(item.vehicleId)), text(plate(item.vehicleId)), text(sources.get(item.id)?.concept), money(item.amount), status(item.status), text(), text(sources.get(item.id)?.notes)]), [
    total('Total gastos registrados (todos los estados)', money(sum(expenses))), total('Total gastos realizados (Informes)', money(sum(paidExpenses))),
    ...['Mantenimiento', 'Reparaciones', 'ITV', 'Impuestos', 'Multa', 'Documentación'].map(category => total(`Total ${category}`, money(sum(expenses.filter(item => expenseCategory(item) === category))))),
    ...state.vehicles.map(v => total(`Gastos · ${vname(v.id)} · ${v.plate}`, money(sum(expenses.filter(item => item.vehicleId === v.id))))),
  ]))
  const vehicleStatuses = getVehicleStatusMap(state, today)
  sheets.push(table('Vehículos', ['Matrícula', 'Marca', 'Modelo', 'Año', 'Tipo de vehículo', 'Estado calculado', 'Cliente actual', 'Próxima reserva', 'Precio por día', 'Precio por semana', 'Precio por mes', 'Km incluidos por día', 'Precio por km extra (sin IVA)', 'Precio por km extra (IVA 21% incluido)', 'Ingresos cobrados', 'Gastos realizados', 'Beneficio estimado', 'Notas'], state.vehicles.map(v => {
    const info = vehicleStatuses.get(v.id)!
    const next = state.rentals.filter(r => r.vehicleId === v.id && isReservation(r)).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
    const income = sum(incomes.filter(item => item.vehicleId === v.id && item.status === 'pagado'))
    const expense = sum(paidExpenses.filter(item => item.vehicleId === v.id))
    return [text(v.plate), text(v.brand), text(v.model), number(v.year), text(v.category), status(info.label.toLowerCase()), text(info.status === 'alquilado' ? info.customer?.name : ''), date(next?.startDate), money(v.dailyRate), money(v.weeklyRate), money(v.monthlyRate), number(v.includedKmPerDay), money(v.extraKmRate), money(Math.round(v.extraKmRate * 1.21 * 100) / 100), money(income, colors.green), money(expense), profit(income - expense), text(v.notes)]
  }), [total('Total vehículos', number(state.vehicles.length)), total('Ingresos de la flota actual', money(sum(incomes.filter(item => !!item.vehicleId && vehicles.has(item.vehicleId) && item.status === 'pagado')))), total('Gastos de la flota actual', money(sum(paidExpenses.filter(item => !!item.vehicleId && vehicles.has(item.vehicleId)))))]))
  sheets.push(table('Clientes', ['Nombre', 'Teléfono', 'Email', 'Documento / DNI', 'Número de alquileres', 'Alquiler activo', 'Vehículo actual', 'Reservas futuras', 'Total pagado', 'Total pendiente', 'Total atrasado', 'Multas vinculadas', 'Documentos subidos', 'Notas'], state.customers.map(c => {
    const related = state.rentals.filter(r => r.customerId === c.id)
    const active = related.filter(isActive)
    const income = incomes.filter(item => item.customerId === c.id)
    return [text(c.name), text(c.phone), text(c.email), text(c.dni), number(related.length), text(active.length ? 'Sí' : 'No'), text(active.map(r => `${vname(r.vehicleId)} · ${plate(r.vehicleId)}`).join('\n')), number(related.filter(isReservation).length), money(sum(income.filter(item => item.status === 'pagado')), colors.green), money(sum(income.filter(item => item.status === 'pendiente'))), debt(sum(income.filter(item => item.status === 'atrasado'))), number(state.fines.filter(f => f.customerId === c.id).length), number(state.clientDocuments.filter(d => d.customerId === c.id).length), text()]
  }), [total('Total clientes', number(state.customers.length)), total('Total cobrado de clientes actuales', money(sum(incomes.filter(item => !!item.customerId && customers.has(item.customerId) && item.status === 'pagado')))), total('Total deuda de clientes actuales', debt(sum(overdue.filter(item => !!item.customerId && customers.has(item.customerId)))))]))
  const periods = { dia: 'Por días', semana: 'Semanal', mes: 'Mensual', otro: 'Personalizado' }
  sheets.push(table('Alquileres', ['Fecha de inicio', 'Fecha de fin', 'Cliente', 'Vehículo', 'Matrícula', 'Tipo de alquiler', 'Estado del alquiler', 'Importe acordado', 'Próxima fecha de pago', 'Frecuencia del recordatorio', 'Pago flexible', 'Notas', 'ID alquiler'], state.rentals.map(r => [date(r.startDate), date(r.endDate), text(cname(r.customerId)), text(vname(r.vehicleId)), text(plate(r.vehicleId)), text(periods[r.pricePeriod]), status(r.status === 'pendiente' || isReservation(r) ? 'reservado' : r.status), money(r.agreedPrice), date(r.nextPaymentDate), text(reminderFrequencyLabels[r.paymentReminderFrequency || 'none']), text(state.payments.some(p => p.rentalId === r.id && p.status !== 'cancelado' && isFlexiblePayment(p)) ? 'Sí' : 'No'), text(r.notes), text(r.id)]), [total('Número de alquileres', number(state.rentals.length)), total('Importes acordados (no equivale a ingresos)', money(state.rentals.reduce((n, r) => n + r.agreedPrice, 0)))]))
  const maintenanceTotals = state.vehicles.map(v => ({ id: v.id, amount: state.maintenance.filter(m => m.vehicleId === v.id).reduce((n, m) => n + m.cost, 0) })).sort((a, b) => b.amount - a.amount)
  sheets.push(table('Mantenimiento', ['Fecha', 'Vehículo', 'Matrícula', 'Intervención', 'Importe', 'Estado', 'Notas'], state.maintenance.map(m => [date(m.date), text(vname(m.vehicleId)), text(plate(m.vehicleId)), text(m.type), money(m.cost), status(m.status === 'programado' ? 'pendiente' : m.status === 'completado' ? 'finalizado' : m.status), text(m.notes)]), [total('Total gastado en mantenimiento (registrado)', money(state.maintenance.reduce((n, m) => n + m.cost, 0))), total('Vehículo con más gasto', text(maintenanceTotals[0]?.amount > 0 ? `${vname(maintenanceTotals[0].id)} · ${plate(maintenanceTotals[0].id)}` : 'Sin gastos')), total('Intervenciones registradas', number(state.maintenance.length))]))
  sheets.push(table('ITV y documentación', ['Vehículo', 'Matrícula', 'Tipo de documento', 'Fecha de vencimiento', 'Estado', 'Coste', 'Aviso configurado', 'Notas', 'Estado de pago', 'Fecha de pago'], state.documents.map(d => [text(vname(d.vehicleId)), text(plate(d.vehicleId)), text(d.type), date(d.expiryDate), status(days(today, d.expiryDate) < 0 ? 'caducado' : days(today, d.expiryDate) <= 30 ? 'próximo' : 'vigente'), d.cost === undefined ? text() : money(d.cost), text('Automático: 30 días antes'), text(d.notes), status(d.paymentStatus || 'pendiente'), date(d.paidDate)]), [total('Total costes registrados', money(state.documents.reduce((n, d) => n + (d.cost || 0), 0))), total('Documentos registrados', number(state.documents.length))]))
  sheets.push(table('Multas e impuestos', ['Fecha', 'Tipo', 'Vehículo', 'Matrícula', 'Cliente vinculado', 'Importe', 'Estado', 'Fecha de pago', 'Aviso configurado', 'Notas', 'Concepto', 'Vencimiento'], [
    ...state.fines.map(f => [date(f.infractionDate), text('Multa'), text(vname(f.vehicleId)), text(plate(f.vehicleId)), text(cname(f.customerId)), money(f.amount), status(f.status), text(), text(['pendiente', 'reclamada'].includes(f.status) ? 'Seguimiento automático' : ''), text(f.notes), text(f.concept), date(f.dueDate)]),
    ...state.taxes.map(t => [date(t.dueDate), text(/circulaci[oó]n|ivtm/i.test(t.concept) ? 'Impuesto de circulación' : 'Otro impuesto'), text(vname(t.vehicleId)), text(plate(t.vehicleId)), text(), money(t.amount), status(t.status === 'pagado' ? 'pagado' : t.dueDate < today ? 'atrasado' : 'pendiente'), date(t.paidDate), text('Automático: 14 días antes'), text(t.notes), text(t.concept), date(t.dueDate)]),
  ], [total('Total multas (todos los estados)', money(state.fines.reduce((n, f) => n + f.amount, 0))), total('Total impuestos', money(state.taxes.reduce((n, t) => n + t.amount, 0))), total('Registros', number(state.fines.length + state.taxes.length))]))
  const movementIds = new Set(movements.map(item => item.id))
  const operational: Array<{ id: string; date: string; type: string; vehicleId?: string; customerId?: string; status: string; origin: string; notes: string }> = [
    ...state.rentals.map(r => ({ id: `rental-${r.id}`, date: r.startDate, type: 'Alquiler', vehicleId: r.vehicleId, customerId: r.customerId, status: r.status, origin: 'Alquiler', notes: r.notes })),
    ...state.payments.map(p => ({ id: `payment-${p.id}`, date: p.paidDate || p.dueDate, type: 'Pago', vehicleId: rentals.get(p.rentalId)?.vehicleId, customerId: rentals.get(p.rentalId)?.customerId, status: p.status, origin: 'Pago', notes: p.notes })),
    ...state.maintenance.map(m => ({ id: `maintenance-${m.id}`, date: m.date, type: m.type, vehicleId: m.vehicleId, status: m.status, origin: 'Mantenimiento', notes: m.notes })),
    ...state.documents.map(d => ({ id: `document-${d.id}`, date: d.expiryDate, type: d.type, vehicleId: d.vehicleId, status: d.expiryDate < today ? 'caducado' : 'vigente', origin: /itv/i.test(d.type) ? 'ITV' : 'Documento', notes: d.notes })),
    ...state.taxes.map(t => ({ id: `tax-${t.id}`, date: t.paidDate || t.dueDate, type: t.concept, vehicleId: t.vehicleId, status: t.status, origin: 'Impuesto', notes: t.notes })),
    ...state.fines.map(f => ({ id: `fine-${f.id}`, date: f.infractionDate, type: f.concept, vehicleId: f.vehicleId, customerId: f.customerId, status: f.status, origin: 'Multa', notes: f.notes })),
    ...state.clientDocuments.map(d => ({ id: `clientDocument-${d.id}`, date: d.uploadedAt.slice(0, 10), type: d.type, customerId: d.customerId, status: 'Subido', origin: 'Documento', notes: [d.fileName, d.notes].filter(Boolean).join(' · ') })),
  ].filter(item => !movementIds.has(item.id))
  const recentRows: Array<{ date: string; row: Row }> = [
    ...movements.map(item => ({ date: item.date, row: [date(item.date), text(item.category), text(vname(item.vehicleId)), text(cname(item.customerId)), money(item.kind === 'ingreso' ? item.amount : -item.amount, item.status === 'atrasado' ? colors.red : item.kind === 'ingreso' && item.status === 'pagado' ? colors.green : undefined), status(item.status), text(sources.get(item.id)?.origin), text(sources.get(item.id)?.notes)] })),
    ...operational.map(item => ({ date: item.date, row: [date(item.date), text(item.type), text(vname(item.vehicleId)), text(cname(item.customerId)), text(), status(item.status), text(item.origin), text([item.notes, 'Registro operativo; sin importe contabilizado adicional.'].filter(Boolean).join('\n'))] })),
  ]
  recentRows.sort((a, b) => b.date.localeCompare(a.date))
  sheets.push(table('Últimos movimientos', ['Fecha', 'Tipo', 'Vehículo', 'Cliente', 'Importe', 'Estado', 'Origen del movimiento', 'Notas'], recentRows.map(item => item.row), [total('Total movimientos económicos y operativos', number(recentRows.length)), total('Total ingresos (todos los estados)', money(sum(incomes))), total('Total gastos (todos los estados)', money(sum(expenses))), total('Balance realizado', profit(summary.totalPaid - sum(paidExpenses)))]))
  return sheets
}
