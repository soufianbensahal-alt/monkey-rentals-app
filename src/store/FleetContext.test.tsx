import { act, renderHook, waitFor } from '@testing-library/react'
import { FleetProvider, STORAGE_KEY, useFleet } from './FleetContext'

describe('FleetContext',()=>{
  it('persiste el descarte por alquiler sin borrar datos ni cambiar pagos',async()=>{
    const {result,unmount}=renderHook(()=>useFleet(),{wrapper:FleetProvider})
    const rental={id:'dismiss-test',vehicleId:'v',customerId:'c',startDate:'2026-09-01',agreedPrice:600,pricePeriod:'mes' as const,expectedKilometers:0,status:'finalizado' as const,notes:''}
    act(()=>result.current.upsert('rentals',rental))
    act(()=>result.current.dismissMileageAlert(rental.id))
    expect(result.current.state.rentals[0]).toEqual({...rental,mileageAlertDismissed:true})
    expect(result.current.state.payments).toEqual([])
    await waitFor(()=>expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).rentals[0].mileageAlertDismissed).toBe(true))
    unmount()
    const restored=renderHook(()=>useFleet(),{wrapper:FleetProvider})
    expect(restored.result.current.state.rentals[0].mileageAlertDismissed).toBe(true)
  })
  beforeEach(()=>localStorage.clear())

  it('inicia vacío y con Jonathan como administrador',()=>{
    const {result}=renderHook(()=>useFleet(),{wrapper:FleetProvider})
    expect(result.current.state.vehicles).toHaveLength(0)
    expect(result.current.state.rentals).toHaveLength(0)
    expect(result.current.state.adminSettings.name).toBe('Jonathan')
  })

  it('persiste los nuevos datos en localStorage v4',async()=>{
    const {result}=renderHook(()=>useFleet(),{wrapper:FleetProvider})
    act(()=>result.current.upsert('tasks',{id:'test',title:'Revisar contrato',dueDate:'2026-06-15',priority:'alta',completed:false,category:'Test'}))
    await waitFor(()=>expect(localStorage.getItem(STORAGE_KEY)).toContain('Revisar contrato'))
  })

  it('marca un pago mensual y crea el vencimiento del mes siguiente',()=>{
    const {result}=renderHook(()=>useFleet(),{wrapper:FleetProvider})
    act(()=>{
      result.current.upsert('rentals',{id:'r1',vehicleId:'v1',customerId:'c1',startDate:'2026-06-01',agreedPrice:500,pricePeriod:'mes',expectedKilometers:1500,nextPaymentDate:'2026-06-05',paymentReminderFrequency:'monthly',paymentRecurrenceType:'recurrente',status:'activo',notes:''})
      result.current.upsert('payments',{id:'p1',rentalId:'r1',dueDate:'2026-06-05',amount:500,status:'pendiente',reminderEnabled:true,reminderFrequency:'monthly',recurrenceType:'recurrente',recurrenceInterval:1,notes:''})
    })
    act(()=>result.current.markPaymentPaid('p1'))
    expect(result.current.state.payments.find(p=>p.id==='p1')?.status).toBe('pagado')
    expect(result.current.state.payments.some(p=>p.dueDate==='2026-07-05'&&p.status==='pendiente')).toBe(true)
  })

  it('marca un pago semanal y crea el siguiente a 7 días',()=>{
    const {result}=renderHook(()=>useFleet(),{wrapper:FleetProvider})
    act(()=>{
      result.current.upsert('rentals',{id:'r1',vehicleId:'v1',customerId:'c1',startDate:'2026-06-01',agreedPrice:500,pricePeriod:'semana',expectedKilometers:1500,nextPaymentDate:'2026-06-05',paymentReminderFrequency:'weekly',paymentRecurrenceType:'recurrente',status:'activo',notes:''})
      result.current.upsert('payments',{id:'p1',rentalId:'r1',dueDate:'2026-06-05',amount:500,status:'pendiente',reminderEnabled:true,reminderFrequency:'weekly',recurrenceType:'recurrente',recurrenceInterval:1,notes:''})
    })
    act(()=>result.current.markPaymentPaid('p1'))
    expect(result.current.state.payments.some(p=>p.dueDate==='2026-06-12'&&p.status==='pendiente')).toBe(true)
  })

  it('no crea otro vencimiento si el pago es único',()=>{
    const {result}=renderHook(()=>useFleet(),{wrapper:FleetProvider})
    act(()=>{
      result.current.upsert('rentals',{id:'r1',vehicleId:'v1',customerId:'c1',startDate:'2026-06-01',agreedPrice:500,pricePeriod:'dia',expectedKilometers:0,nextPaymentDate:'2026-06-05',paymentReminderFrequency:'once',paymentRecurrenceType:'unico',status:'activo',notes:''})
      result.current.upsert('payments',{id:'p1',rentalId:'r1',dueDate:'2026-06-05',amount:500,status:'pendiente',reminderEnabled:true,reminderFrequency:'once',recurrenceType:'unico',recurrenceInterval:1,notes:''})
    })
    act(()=>result.current.markPaymentPaid('p1'))
    expect(result.current.state.payments).toHaveLength(1)
    expect(result.current.state.payments[0].status).toBe('pagado')
  })

  it('no repite un cargo de km extra ni altera la siguiente cuota del alquiler',()=>{
    const {result}=renderHook(()=>useFleet(),{wrapper:FleetProvider})
    act(()=>{
      result.current.upsert('rentals',{id:'r1',vehicleId:'v1',customerId:'c1',startDate:'2026-09-01',agreedPrice:500,pricePeriod:'mes',expectedKilometers:0,nextPaymentDate:'2026-10-01',status:'activo',notes:''})
      result.current.upsert('payments',{id:'extra',rentalId:'r1',dueDate:'2026-09-05',amount:27.23,status:'pendiente',type:'km_extra',reminderEnabled:true,reminderFrequency:'monthly',recurrenceType:'recurrente',notes:''})
    })
    act(()=>result.current.markPaymentPaid('extra'))
    expect(result.current.state.payments).toHaveLength(1)
    expect(result.current.state.payments[0].status).toBe('pagado')
    expect(result.current.state.rentals[0].nextPaymentDate).toBe('2026-10-01')
  })
})
