import { act, renderHook, waitFor } from '@testing-library/react'
import { FleetProvider, STORAGE_KEY, useFleet } from './FleetContext'

describe('FleetContext',()=>{
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

  it('marca un pago y crea el vencimiento del mes siguiente',()=>{
    const {result}=renderHook(()=>useFleet(),{wrapper:FleetProvider})
    act(()=>{
      result.current.upsert('rentals',{id:'r1',vehicleId:'v1',customerId:'c1',startDate:'2026-06-01',agreedPrice:500,pricePeriod:'mes',expectedKilometers:1500,nextPaymentDate:'2026-06-05',status:'activo',notes:''})
      result.current.upsert('payments',{id:'p1',rentalId:'r1',dueDate:'2026-06-05',amount:500,status:'pendiente',notes:''})
    })
    act(()=>result.current.markPaymentPaid('p1'))
    expect(result.current.state.payments.find(p=>p.id==='p1')?.status).toBe('pagado')
    expect(result.current.state.payments.some(p=>p.dueDate==='2026-07-05'&&p.status==='pendiente')).toBe(true)
  })
})
