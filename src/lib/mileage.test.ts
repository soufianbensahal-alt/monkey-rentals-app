import { describe, expect, it } from 'vitest'
import { emptyState } from '../data/emptyState'
import type { FleetState, Rental } from '../types'
import { calculateMileage, getVehicleMileage, mileageReport, saveRentalMileage, validateMileage } from './mileage'
import { buildReport } from './reports'
import { getSystemAlerts } from './alerts'

export function mileageFixture(): FleetState {
  return { ...structuredClone(emptyState),
    vehicles:[{id:'v1',brand:'Fiat',model:'Dobló',plate:'1234ABC',category:'Furgoneta',year:2022,dailyRate:30,weeklyRate:180,monthlyRate:600,includedKmPerDay:125,extraKmRate:0.15,status:'disponible',notes:''}],
    customers:[{id:'c1',name:'Juan Pérez',email:'',phone:'',dni:'',rentals:0}],
  }
}
const rental: Rental = {id:'r1',vehicleId:'v1',customerId:'c1',startDate:'2026-09-01',endDate:'2026-09-05',agreedPrice:120,pricePeriod:'dia',durationDays:4,expectedKilometers:0,status:'finalizado',notes:'',kmStart:125400,kmEnd:126050,kmIncludedTotal:500,kmExtraEnabled:true}

describe('Control de kilometraje', () => {
  it('calcula 650 km, 150 extra y 27,23 € con redondeo de base e IVA', () => {
    expect(calculateMileage(rental, mileageFixture().vehicles[0])).toEqual({used:650,extra:150,price:0.15,vatRate:21,base:22.5,vat:4.73,total:27.23})
    expect(calculateMileage({...rental,kmEnd:126000}, mileageFixture().vehicles[0])).toMatchObject({extra:100,base:15,vat:3.15,total:18.15})
  })
  it('no calcula distancias sin ambas lecturas, respeta cero y no cobra sin activación', () => {
    expect(calculateMileage({...rental,kmEnd:undefined}).used).toBeUndefined()
    expect(calculateMileage({...rental,kmStart:undefined}).used).toBeUndefined()
    expect(calculateMileage({...rental,kmStart:0,kmEnd:0,kmExtraPrice:0})).toMatchObject({used:0,extra:0,total:0})
    expect(calculateMileage({...rental,kmExtraEnabled:false})).toMatchObject({used:650,extra:undefined,total:undefined})
    expect(calculateMileage({...rental,kmExtraPrice:0},mileageFixture().vehicles[0]).total).toBe(0)
    expect(calculateMileage({...rental,kmIncludedTotal:700},mileageFixture().vehicles[0]).extra).toBe(0)
  })
  it('valida lecturas, límites y tarifas sin confundir cero con ausencia', () => {
    const v = mileageFixture().vehicles[0]
    for (const patch of [{kmStart:-1},{kmEnd:-1},{kmEnd:125399},{kmStart:undefined},{kmExtraPrice:-1},{kmIncludedTotal:undefined},{kmIncludedTotal:NaN}]) expect(validateMileage({...rental,...patch},v)).toBeTruthy()
    expect(validateMileage({...rental,kmExtraPrice:0,kmIncludedTotal:0},v)).toBeUndefined()
    expect(validateMileage({...rental,kmEnd:undefined,status:'activo'} as Rental,v)).toBeUndefined()
  })
  it('guarda alquiler, odómetro y un único pago solo tras revisión', () => {
    const state = mileageFixture()
    const snapshot = structuredClone(state)
    const noCharge = saveRentalMileage(state,rental,false,'2026-09-05')
    expect(noCharge.payments).toHaveLength(0)
    expect(noCharge.vehicles[0]).toMatchObject({currentKm:126050,lastKmUpdate:'2026-09-05'})
    const charged = saveRentalMileage(noCharge,noCharge.rentals[0],true,'2026-09-05')
    expect(charged.payments[0]).toMatchObject({type:'km_extra',amount:27.23,status:'pendiente',rentalId:'r1',kmExtraRelated:150,kmExtraVatAmount:4.73,recurrenceType:'unico'})
    expect(charged.rentals[0].kmExtraPaymentId).toBe(charged.payments[0].id)
    expect(saveRentalMileage(charged,charged.rentals[0],true,'2026-09-05').payments).toHaveLength(1)
    expect(state).toEqual(snapshot)
  })
  it('protege cargos existentes y permite recalcular tras cancelarlos conservando el histórico', () => {
    const state = saveRentalMileage(mileageFixture(),rental,true,'2026-09-05')
    expect(() => saveRentalMileage(state,{...state.rentals[0],kmEnd:127000},false,'2026-09-05')).toThrow('ya tiene un cargo')
    state.payments[0].status='pagado'
    expect(() => saveRentalMileage(state,{...state.rentals[0],kmExtraEnabled:false},false,'2026-09-05')).toThrow()
    state.payments[0].status='cancelado'
    const revised = saveRentalMileage(state,{...state.rentals[0],kmEnd:127000},true,'2026-09-05')
    expect(revised.payments).toHaveLength(2)
    expect(revised.payments[0].status).toBe('cancelado')
    expect(revised.payments[0].id).not.toBe(revised.payments[1].id)
  })
  it('conserva la tarifa del acuerdo y no retrocede el odómetro al cerrar un alquiler antiguo', () => {
    const state = saveRentalMileage(mileageFixture(),rental,false,'2026-09-05')
    state.vehicles[0].extraKmRate=0.5
    expect(calculateMileage(state.rentals[0],state.vehicles[0]).total).toBe(27.23)
    const newer = saveRentalMileage(state,{...rental,id:'r2',startDate:'2026-09-10',endDate:'2026-09-12',kmStart:126050,kmEnd:127000},false,'2026-09-12')
    const old = saveRentalMileage(newer,{...rental,kmEnd:126100},false,'2026-09-14')
    expect(old.vehicles[0].currentKm).toBe(127000)
    expect(getVehicleMileage(old,'v1').totalUsed).toBe(1650)
  })
  it('crea y resuelve avisos de cierre, sin exigir cobros', () => {
    const state = saveRentalMileage(mileageFixture(),{...rental,kmEnd:undefined,kmExtraEnabled:false},false,'2026-09-05')
    expect(getSystemAlerts(state).find(a => a.id==='mileage-r1')?.title).toBe('Faltan km finales del alquiler.')
    const done = saveRentalMileage(state,{...state.rentals[0],kmEnd:126050},false,'2026-09-05')
    expect(getSystemAlerts(done).some(a => a.id==='mileage-r1')).toBe(false)
    expect(done.payments).toHaveLength(0)
  })
  it('separa ingresos extra y mantiene la previsión base cuando solo existe el cargo extra', () => {
    const state = saveRentalMileage(mileageFixture(),rental,true,'2026-09-05')
    expect(buildReport(state,'2026-09-05').summary.totalExpected).toBe(147.23)
    state.payments[0]={...state.payments[0],status:'pagado',paidDate:'2026-09-05'}
    const report=mileageReport(state,'2026-09-05')
    expect(report).toMatchObject({totalPaid:27.23,monthIncome:27.23,pending:0,topVehicleId:'v1',topCustomerId:'c1'})
    expect(report.monthly).toEqual([{month:'2026-09',km:150,income:27.23}])
    expect(buildReport(state,'2026-09-05').summary.monthProfit).toBe(27.23)
    expect(mileageReport(mileageFixture(),'2026-09-05').totalPaid).toBe(0)
  })
})
