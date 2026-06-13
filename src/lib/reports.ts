import type { FleetState } from '../types'

export type ExpenseCategory = 'Reparaciones' | 'Mantenimiento' | 'ITV' | 'Impuestos' | 'Documentación' | 'Otros'
export type MovementStatus = 'pagado' | 'pendiente' | 'atrasado' | 'registrado'

export interface EconomicMovement {
  id: string
  date: string
  kind: 'ingreso' | 'gasto'
  category: string
  vehicleId?: string
  customerId?: string
  amount: number
  status: MovementStatus
}

export interface MonthlyReport {
  month: string
  paid: number
  pending: number
  overdue: number
  expenses: number
  profit: number
}

const monthKey = (date: string) => date.slice(0, 7)
const isRepair = (type: string) => /repar|aver[ií]a|chapa|motor|neum[aá]tico/i.test(type)
const documentCategory = (type: string): ExpenseCategory => /itv/i.test(type) ? 'ITV' : 'Documentación'

export function economicMovements(state: FleetState, today = new Date().toISOString().slice(0, 10)): EconomicMovement[] {
  const rentals = new Map(state.rentals.map(item => [item.id, item]))
  const rentalIdsWithPayments = new Set(state.payments.map(item => item.rentalId))
  const payments: EconomicMovement[] = state.payments.filter(item => Number(item.amount) > 0).map(item => {
    const rental = rentals.get(item.rentalId)
    const status = item.status === 'pagado' || item.status === 'flexible' || item.status === 'atrasado' ? item.status : item.dueDate < today ? 'atrasado' : 'pendiente'
    return {
      id:`payment-${item.id}`, date:item.paidDate || item.dueDate, kind:'ingreso', category:'Alquiler',
      vehicleId:rental?.vehicleId, customerId:rental?.customerId, amount:Number(item.amount),
      status:status === 'flexible' ? 'pendiente' : status,
    }
  })
  const rentalIncome: EconomicMovement[] = state.rentals.filter(item => item.status !== 'cancelado' && Number(item.agreedPrice) > 0 && !rentalIdsWithPayments.has(item.id)).map(item => {
    const dueDate = item.nextPaymentDate || item.startDate
    return {
      id:`rental-${item.id}`, date:dueDate, kind:'ingreso', category:'Alquiler previsto', vehicleId:item.vehicleId,
      customerId:item.customerId, amount:Number(item.agreedPrice), status:dueDate < today ? 'atrasado' : 'pendiente',
    }
  })
  const maintenance: EconomicMovement[] = state.maintenance.filter(item => Number(item.cost) > 0).map(item => ({
    id:`maintenance-${item.id}`, date:item.date, kind:'gasto', category:isRepair(item.type)?'Reparaciones':'Mantenimiento',
    vehicleId:item.vehicleId, amount:Number(item.cost), status:'registrado',
  }))
  const taxes: EconomicMovement[] = state.taxes.filter(item => Number(item.amount) > 0).map(item => ({
    id:`tax-${item.id}`, date:item.paidDate || item.dueDate, kind:'gasto', category:'Impuestos', vehicleId:item.vehicleId,
    amount:Number(item.amount), status:item.status === 'pagado' ? 'pagado' : item.dueDate < today ? 'atrasado' : 'pendiente',
  }))
  const documents: EconomicMovement[] = state.documents.filter(item => Number(item.cost || 0) > 0).map(item => ({
    id:`document-${item.id}`, date:item.paidDate || item.expiryDate, kind:'gasto', category:documentCategory(item.type),
    vehicleId:item.vehicleId, amount:Number(item.cost || 0),
    status:item.paymentStatus === 'pagado' ? 'pagado' : item.expiryDate < today ? 'atrasado' : 'pendiente',
  }))
  const fines: EconomicMovement[] = state.fines.filter(item => Number(item.amount) > 0 && item.status !== 'archivada' && item.status !== 'cargada al cliente').map(item => ({
    id:`fine-${item.id}`, date:item.infractionDate, kind:'gasto', category:'Otros', vehicleId:item.vehicleId,
    customerId:item.customerId, amount:Number(item.amount), status:item.status === 'pagada' ? 'pagado' : 'pendiente',
  }))
  return [...payments, ...rentalIncome, ...maintenance, ...taxes, ...documents, ...fines]
}

export function buildReport(state: FleetState, today = new Date().toISOString().slice(0, 10)) {
  const movements = economicMovements(state, today)
  const hasEconomicData = state.payments.some(item=>Number(item.amount)>0)
    || state.rentals.some(item=>Number(item.agreedPrice)>0)
    || state.maintenance.some(item=>Number(item.cost)>0)
    || state.documents.some(item=>Number(item.cost||0)>0)
    || state.taxes.some(item=>Number(item.amount)>0)
    || state.fines.some(item=>Number(item.amount)>0)
  const currentMonth = monthKey(today)
  const paidIncome = movements.filter(item => item.kind === 'ingreso' && item.status === 'pagado')
  const pendingIncome = movements.filter(item => item.kind === 'ingreso' && item.status === 'pendiente')
  const overdueIncome = movements.filter(item => item.kind === 'ingreso' && item.status === 'atrasado')
  const realizedExpenses = movements.filter(item => item.kind === 'gasto' && (item.status === 'pagado' || item.status === 'registrado'))
  const totalPaid = paidIncome.reduce((sum,item)=>sum+item.amount,0)
  const totalPending = pendingIncome.reduce((sum,item)=>sum+item.amount,0)
  const totalOverdue = overdueIncome.reduce((sum,item)=>sum+item.amount,0)
  const monthIncome = paidIncome.filter(item => monthKey(item.date) === currentMonth).reduce((sum,item)=>sum+item.amount,0)
  const monthExpenses = realizedExpenses.filter(item => monthKey(item.date) === currentMonth).reduce((sum,item)=>sum+item.amount,0)
  const monthlyMap = movements.reduce<Record<string,MonthlyReport>>((acc,item)=>{
    const month=monthKey(item.date)
    const row=acc[month]??{month,paid:0,pending:0,overdue:0,expenses:0,profit:0}
    if(item.kind==='ingreso') row[item.status==='pagado'?'paid':item.status==='atrasado'?'overdue':'pending']+=item.amount
    else if(item.status==='pagado'||item.status==='registrado') row.expenses+=item.amount
    row.profit=row.paid-row.expenses
    acc[month]=row
    return acc
  },{})
  const monthly=Object.values(monthlyMap).sort((a,b)=>a.month.localeCompare(b.month)).slice(-12)
  const categories = (['Reparaciones','Mantenimiento','ITV','Impuestos','Documentación','Otros'] as ExpenseCategory[]).map(category => ({
    category,
    total:realizedExpenses.filter(item => item.category === category).reduce((sum,item)=>sum+item.amount,0),
  })).filter(item => item.total > 0)
  const vehicleTotals = (items:EconomicMovement[]) => items.reduce<Record<string,number>>((acc,item)=>{
    if (item.vehicleId) acc[item.vehicleId]=(acc[item.vehicleId]||0)+item.amount
    return acc
  },{})
  const topId = (totals:Record<string,number>) => Object.entries(totals).sort((a,b)=>b[1]-a[1])[0]?.[0]
  return {
    hasEconomicData, movements:[...movements].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12), monthly, categories,
    summary:{
      totalPaid, totalPending, totalOverdue, totalExpected:totalPaid+totalPending+totalOverdue,
      monthIncome, monthExpenses, monthProfit:monthIncome-monthExpenses,
      pending:totalPending, overdue:totalOverdue,
      topIncomeVehicleId:topId(vehicleTotals(paidIncome)),
      topExpenseVehicleId:topId(vehicleTotals(realizedExpenses)),
    },
  }
}
