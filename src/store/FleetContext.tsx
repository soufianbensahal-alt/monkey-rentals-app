import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { emptyState } from '../data/emptyState'
import type { AdminSettings, CalendarEvent, Customer, Document, Fine, FleetState, MaintenanceRecord, Payment, Rental, Task, Vehicle, VehicleTax } from '../types'

export const STORAGE_KEY = 'monkey-rentals-flota:v4'
const LEGACY_STORAGE_KEYS = ['monkey-rentals-flota:v3','monkey-rentals-flota:v2']
type Entity = Vehicle | Customer | Rental | Payment | Task | MaintenanceRecord | Document | VehicleTax | Fine | CalendarEvent
type Collection = 'vehicles' | 'customers' | 'rentals' | 'payments' | 'tasks' | 'maintenance' | 'documents' | 'taxes' | 'fines' | 'events'
type Action =
  | { type:'upsert'; collection:Collection; item:Entity }
  | { type:'remove'; collection:Collection; id:string }
  | { type:'toggleTask'; id:string }
  | { type:'markPaymentPaid'; id:string }
  | { type:'settings'; settings:AdminSettings }
  | { type:'reset' }

function addMonth(date: string) {
  const next = new Date(`${date}T12:00:00`)
  next.setMonth(next.getMonth() + 1)
  return next.toISOString().slice(0, 10)
}

function reducer(state: FleetState, action: Action): FleetState {
  if (action.type === 'reset') return structuredClone(emptyState)
  if (action.type === 'settings') return { ...state, adminSettings: action.settings }
  if (action.type === 'toggleTask') return { ...state, tasks: state.tasks.map(t => t.id === action.id ? { ...t, completed: !t.completed } : t) }
  if (action.type === 'markPaymentPaid') {
    const payment = state.payments.find(item => item.id === action.id)
    if (!payment) return state
    const rental = state.rentals.find(item => item.id === payment.rentalId)
    const nextDate = addMonth(payment.dueDate)
    const nextPayment: Payment | null = rental?.status === 'activo' && rental.nextPaymentDate ? {
      id: `payment-${Date.now()}`,
      rentalId: payment.rentalId,
      dueDate: nextDate,
      amount: rental.agreedPrice,
      status: 'pendiente',
      method: payment.method,
      notes: '',
    } : null
    return {
      ...state,
      payments: [
        ...state.payments.map(item => item.id === action.id ? { ...item, status:'pagado' as const, paidDate:new Date().toISOString().slice(0,10) } : item),
        ...(nextPayment && !state.payments.some(item => item.rentalId === nextPayment.rentalId && item.dueDate === nextDate) ? [nextPayment] : []),
      ],
      rentals: state.rentals.map(item => item.id === payment.rentalId && item.nextPaymentDate ? { ...item, nextPaymentDate:nextDate } : item),
    }
  }
  if (action.type === 'remove') {
    if (action.collection === 'vehicles') {
      const rentalIds = state.rentals.filter(item => item.vehicleId === action.id).map(item => item.id)
      return { ...state, vehicles:state.vehicles.filter(item=>item.id!==action.id), rentals:state.rentals.filter(item=>item.vehicleId!==action.id), payments:state.payments.filter(item=>!rentalIds.includes(item.rentalId)), maintenance:state.maintenance.filter(item=>item.vehicleId!==action.id), documents:state.documents.filter(item=>item.vehicleId!==action.id), taxes:state.taxes.filter(item=>item.vehicleId!==action.id), fines:state.fines.filter(item=>item.vehicleId!==action.id) }
    }
    if (action.collection === 'customers') {
      const rentalIds = state.rentals.filter(item => item.customerId === action.id).map(item => item.id)
      return { ...state, customers:state.customers.filter(item=>item.id!==action.id), rentals:state.rentals.filter(item=>item.customerId!==action.id), payments:state.payments.filter(item=>!rentalIds.includes(item.rentalId)), fines:state.fines.map(item=>item.customerId===action.id?{...item,customerId:undefined}:item) }
    }
    if (action.collection === 'rentals') return { ...state, rentals:state.rentals.filter(item=>item.id!==action.id), payments:state.payments.filter(item=>item.rentalId!==action.id) }
    return { ...state, [action.collection]: state[action.collection].filter(item => item.id !== action.id) }
  }
  const list = state[action.collection] as Entity[]
  const exists = list.some(item => item.id === action.item.id)
  return { ...state, [action.collection]: exists ? list.map(item => item.id === action.item.id ? action.item : item) : [action.item, ...list] }
}

function initialState(): FleetState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? LEGACY_STORAGE_KEYS.map(key=>localStorage.getItem(key)).find(Boolean)
    if (!stored) return structuredClone(emptyState)
    const parsed = JSON.parse(stored) as FleetState | Record<string, unknown>
    if (parsed.version === 4) return parsed as FleetState
    if (parsed.version === 3) return migrateV3(parsed as unknown as Record<string, unknown>)
    if (parsed.version === 2) return migrateV2(parsed as unknown as Record<string, unknown>)
    return structuredClone(emptyState)
  } catch { return structuredClone(emptyState) }
}

function migrateV3(value: Record<string, unknown>): FleetState {
  return { ...(value as unknown as Omit<FleetState,'version'|'fines'>), version:4, fines:[] }
}

function migrateV2(value: Record<string, unknown>): FleetState {
  const legacyVehicles = Array.isArray(value.vehicles) ? value.vehicles as Array<Record<string, unknown>> : []
  const vehicles: Vehicle[] = legacyVehicles.map(item => {
    const monthlyRate = Number(item.monthlyRate) || 0
    const dailyRate = Number(item.dailyRate) || Math.round((monthlyRate / 30) * 100) / 100
    return {
      id:String(item.id), name:`${String(item.brand ?? '')} ${String(item.model ?? item.name ?? '')}`.trim(), plate:String(item.plate ?? ''), category:String(item.category ?? 'Coche'), brand:String(item.brand ?? ''), model:String(item.model ?? item.name ?? ''), year:Number(item.year) || new Date().getFullYear(),
      dailyRate, weeklyRate:Number(item.weeklyRate) || Math.round(dailyRate * 7 * 100) / 100, monthlyRate,
      includedKmPerDay:Number(item.includedKmPerDay) || 125, extraKmRate:Number(item.extraKmRate) || 0.15,
      status:(item.status ?? 'disponible') as Vehicle['status'], image:String(item.image ?? ''), notes:String(item.notes ?? ''),
    }
  })
  const legacyRentals = Array.isArray(value.rentals) ? value.rentals as Array<Record<string, unknown>> : []
  const rentals: Rental[] = legacyRentals.map(item => ({
    id:String(item.id), vehicleId:String(item.vehicleId), customerId:String(item.customerId), startDate:String(item.startDate), endDate:item.endDate ? String(item.endDate) : undefined,
    agreedPrice:Number(item.agreedPrice ?? item.monthlyPrice) || 0, pricePeriod:(item.pricePeriod ?? 'mes') as Rental['pricePeriod'], expectedKilometers:Number(item.expectedKilometers) || 0,
    nextPaymentDate:String(item.nextPaymentDate), status:(item.status ?? 'activo') as Rental['status'], notes:String(item.notes ?? ''),
  }))
  return {
    ...structuredClone(emptyState),
    vehicles,
    rentals,
    customers:Array.isArray(value.customers) ? value.customers as Customer[] : [],
    payments:Array.isArray(value.payments) ? value.payments as Payment[] : [],
    tasks:Array.isArray(value.tasks) ? value.tasks as Task[] : [],
    maintenance:Array.isArray(value.maintenance) ? value.maintenance as MaintenanceRecord[] : [],
    documents:(Array.isArray(value.documents) ? value.documents : []).map(item => ({...(item as Document), notes:(item as Document).notes ?? ''})),
    events:Array.isArray(value.events) ? value.events as FleetState['events'] : [],
    adminSettings:(value.adminSettings as AdminSettings) ?? emptyState.adminSettings,
  }
}

interface FleetContextValue {
  state:FleetState
  upsert:(collection:Collection,item:Entity)=>void
  remove:(collection:Collection,id:string)=>void
  toggleTask:(id:string)=>void
  markPaymentPaid:(id:string)=>void
  updateSettings:(settings:AdminSettings)=>void
  reset:()=>void
}
const FleetContext = createContext<FleetContextValue | null>(null)

export function FleetProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }, [state])
  const value = useMemo(() => ({
    state,
    upsert:(collection:Collection,item:Entity)=>dispatch({type:'upsert',collection,item}),
    remove:(collection:Collection,id:string)=>dispatch({type:'remove',collection,id}),
    toggleTask:(id:string)=>dispatch({type:'toggleTask',id}),
    markPaymentPaid:(id:string)=>dispatch({type:'markPaymentPaid',id}),
    updateSettings:(settings:AdminSettings)=>dispatch({type:'settings',settings}),
    reset:()=>dispatch({type:'reset'}),
  }), [state])
  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFleet() { const context = useContext(FleetContext); if (!context) throw new Error('useFleet requiere FleetProvider'); return context }
