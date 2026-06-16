import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { emptyState } from '../data/emptyState'
import { fetchRemoteState, hasBusinessData, readRemoteSession, remoteEnabled, saveRemoteSession, saveRemoteState, signInRemote, type RemoteSession, type RemoteStatus } from '../lib/remoteStore'
import { applyTheme, getSavedTheme } from '../lib/theme'
import type { AdminSettings, CalendarEvent, Customer, Document, Fine, FleetState, MaintenanceRecord, Payment, Rental, Task, Vehicle, VehicleTax } from '../types'

export const STORAGE_KEY = 'monkey-rentals-flota:v4'
const LEGACY_STORAGE_KEYS = ['monkey-rentals-flota:v3','monkey-rentals-flota:v2']
type Entity = Vehicle | Customer | Rental | Payment | Task | MaintenanceRecord | Document | VehicleTax | Fine | CalendarEvent
type Collection = 'vehicles' | 'customers' | 'rentals' | 'payments' | 'tasks' | 'maintenance' | 'documents' | 'taxes' | 'fines' | 'events'
type Action =
  | { type:'hydrate'; state:FleetState }
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
  if (action.type === 'hydrate') return action.state
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
  syncStatus:RemoteStatus
  syncError:string
  remoteEnabled:boolean
  authEmail?:string
  upsert:(collection:Collection,item:Entity)=>void
  remove:(collection:Collection,id:string)=>void
  toggleTask:(id:string)=>void
  markPaymentPaid:(id:string)=>void
  updateSettings:(settings:AdminSettings)=>void
  reset:()=>void
  signIn:(email:string,password:string)=>Promise<void>
  signOut:()=>void
  retrySync:()=>Promise<void>
}
const FleetContext = createContext<FleetContextValue | null>(null)

export function FleetProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const initialCache = useRef(state)
  const [session,setSession] = useState<RemoteSession|null>(() => remoteEnabled ? readRemoteSession() : null)
  const [syncStatus,setSyncStatus] = useState<RemoteStatus>(() => remoteEnabled ? (readRemoteSession() ? 'loading' : 'login') : 'local')
  const [syncError,setSyncError] = useState('')
  const hydrated = useRef(!remoteEnabled)
  const skipNextSave = useRef(false)
  const remoteUpdatedAt = useRef<string>('')
  const stateRef = useRef(state)

  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    if (!remoteEnabled) {
      applyTheme(getSavedTheme(), { persist: false })
      return
    }
    applyTheme(session ? getSavedTheme() : 'light', { persist: false })
  }, [session])

  const hydrateFromRemote = useCallback(async (currentSession = session) => {
    if (!remoteEnabled || !currentSession) return
    setSyncStatus('loading')
    try {
      const remote = await fetchRemoteState(currentSession)
      if (remote) {
        remoteUpdatedAt.current = remote.updated_at
        skipNextSave.current = true
        dispatch({ type:'hydrate', state:remote.state })
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remote.state))
      } else if (hasBusinessData(initialCache.current)) {
        remoteUpdatedAt.current = await saveRemoteState(initialCache.current, currentSession)
      }
      hydrated.current = true
      setSyncStatus('online')
      setSyncError('')
    } catch (error) {
      hydrated.current = true
      setSyncStatus('offline')
      setSyncError(error instanceof Error ? error.message : 'Sin conexión con la base de datos.')
    }
  }, [session])

  useEffect(() => {
    if (!remoteEnabled) {
      hydrated.current = true
      return
    }
    if (!session) {
      return
    }
    const timeout = window.setTimeout(() => void hydrateFromRemote(session), 0)
    return () => window.clearTimeout(timeout)
  }, [session, hydrateFromRemote])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    if (!remoteEnabled || !session || !hydrated.current) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    const timeout = window.setTimeout(async () => {
      setSyncStatus('saving')
      try {
        remoteUpdatedAt.current = await saveRemoteState(stateRef.current, session)
        setSyncStatus('online')
        setSyncError('')
      } catch (error) {
        setSyncStatus('offline')
        setSyncError(error instanceof Error ? error.message : 'Cambios guardados solo en caché local.')
      }
    }, 650)
    return () => window.clearTimeout(timeout)
  }, [state, session])

  useEffect(() => {
    if (!remoteEnabled || !session) return
    const refresh = async () => {
      try {
        const remote = await fetchRemoteState(session)
        if (remote && remote.updated_at && remote.updated_at !== remoteUpdatedAt.current) {
          remoteUpdatedAt.current = remote.updated_at
          skipNextSave.current = true
          dispatch({ type:'hydrate', state:remote.state })
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remote.state))
        }
        setSyncStatus('online')
        setSyncError('')
      } catch {
        setSyncStatus('offline')
      }
    }
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    const interval = window.setInterval(refresh, 15000)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); window.clearInterval(interval) }
  }, [session])

  const signIn = useCallback(async (email:string,password:string) => {
    setSyncStatus('loading')
    try {
      const nextSession = await signInRemote(email,password)
      saveRemoteSession(nextSession)
      setSyncError('')
      setSession(nextSession)
    } catch (error) {
      setSyncStatus('login')
      setSyncError(error instanceof Error ? error.message : 'No se ha podido iniciar sesión.')
      throw error
    }
  }, [])

  const signOut = useCallback(() => {
    saveRemoteSession(null)
    setSession(null)
    setSyncStatus(remoteEnabled ? 'login' : 'local')
  }, [])

  const retrySync = useCallback(async () => { await hydrateFromRemote(session) }, [hydrateFromRemote, session])

  const value = useMemo(() => ({
    state, syncStatus, syncError, remoteEnabled, authEmail:session?.email,
    upsert:(collection:Collection,item:Entity)=>dispatch({type:'upsert',collection,item}),
    remove:(collection:Collection,id:string)=>dispatch({type:'remove',collection,id}),
    toggleTask:(id:string)=>dispatch({type:'toggleTask',id}),
    markPaymentPaid:(id:string)=>dispatch({type:'markPaymentPaid',id}),
    updateSettings:(settings:AdminSettings)=>dispatch({type:'settings',settings}),
    reset:()=>dispatch({type:'reset'}),
    signIn, signOut, retrySync,
  }), [state, syncStatus, syncError, session?.email, signIn, signOut, retrySync])
  return <FleetContext.Provider value={value}>{remoteEnabled && !session ? <LoginScreen error={syncError} onSubmit={signIn}/> : children}</FleetContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFleet() { const context = useContext(FleetContext); if (!context) throw new Error('useFleet requiere FleetProvider'); return context }

function LoginScreen({error,onSubmit}:{error:string;onSubmit:(email:string,password:string)=>Promise<void>}) {
  const [message,setMessage]=useState(error)
  const [loading,setLoading]=useState(false)
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    const form=new FormData(event.currentTarget)
    setLoading(true)
    setMessage('')
    try { await onSubmit(String(form.get('email')),String(form.get('password'))) }
    catch (err) { setMessage(err instanceof Error ? err.message : 'No se ha podido iniciar sesión.') }
    finally { setLoading(false) }
  }
  return <main className="grid min-h-dvh place-items-center bg-cream p-4">
    <form onSubmit={submit} className="card w-full max-w-md p-6 sm:p-8">
      <img src="/monkey-rentals-logo.png" alt="" className="mx-auto size-20 object-contain"/>
      <h1 className="mt-4 text-center font-display text-2xl font-bold text-ink">Acceso Monkey Rentals</h1>
      <p className="mt-2 text-center text-sm text-stone-500">Inicia sesión para sincronizar la flota en todos los dispositivos.</p>
      {message&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</p>}
      <label className="mt-5 block"><span className="label">Email</span><input className="field" name="email" type="email" autoComplete="email" required/></label>
      <label className="mt-4 block"><span className="label">Contraseña</span><input className="field" name="password" type="password" autoComplete="current-password" required/></label>
      <button className="btn-primary mt-6 w-full" disabled={loading}>{loading?'Conectando...':'Entrar'}</button>
    </form>
  </main>
}
