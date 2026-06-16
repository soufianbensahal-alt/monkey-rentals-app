import { describe, expect, it } from 'vitest'
import { emptyState } from '../data/emptyState'
import { buildReportExcelData } from './reportExcel'
import type { FleetState } from '../types'

function stateWithExportData(): FleetState {
  return {
    ...structuredClone(emptyState),
    vehicles: [{ id:'v1', plate:'1234ABC', category:'Furgoneta', brand:'Ford', model:'Transit', year:2022, dailyRate:40, weeklyRate:250, monthlyRate:700, includedKmPerDay:125, extraKmRate:.15, status:'disponible', notes:'' }],
    customers: [{ id:'c1', name:'Ana', email:'', phone:'', dni:'', rentals:1 }],
    rentals: [{ id:'r1', vehicleId:'v1', customerId:'c1', startDate:'2026-05-01', agreedPrice:600, pricePeriod:'mes', expectedKilometers:0, status:'activo', notes:'' }],
    payments: [
      { id:'p1', rentalId:'r1', dueDate:'2026-06-01', paidDate:'2026-06-02', amount:600, status:'pagado', notes:'' },
      { id:'p2', rentalId:'r1', dueDate:'2026-06-20', amount:200, status:'pendiente', notes:'' },
    ],
    maintenance: [{ id:'m1', vehicleId:'v1', type:'Cambio aceite', date:'2026-06-04', cost:120, status:'completado', notes:'' }],
    taxes: [{ id:'t1', vehicleId:'v1', concept:'IVTM', dueDate:'2026-06-08', amount:80, status:'pagado', paidDate:'2026-06-08', notes:'' }],
  }
}

describe('buildReportExcelData', () => {
  it('prepara totales y hojas económicas para exportar a Excel', () => {
    const data = buildReportExcelData(stateWithExportData(), '2026-06-13')

    expect(data.hasData).toBe(true)
    expect(data.summary).toMatchObject({
      paidIncome: 600,
      pendingIncome: 200,
      maintenanceExpenses: 120,
      taxExpenses: 80,
      totalIncome: 600,
      totalExpenses: 200,
      finalBalance: 400,
    })
    expect(data.paidPayments).toHaveLength(1)
    expect(data.pendingPayments).toHaveLength(1)
    expect(data.categoryTotals).toEqual(expect.arrayContaining([{ category:'Mantenimiento', total:120 }, { category:'Impuestos', total:80 }]))
  })

  it('indica que no hay datos exportables cuando el estado está vacío', () => {
    const data = buildReportExcelData(structuredClone(emptyState), '2026-06-13')

    expect(data.hasData).toBe(false)
    expect(data.summary.finalBalance).toBe(0)
    expect(data.movements).toEqual([])
  })
})
