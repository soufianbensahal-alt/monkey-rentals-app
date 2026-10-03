import { CACHED_IMAGE_OMITTED, mergeFleetState } from '../lib/stateMerge'
import { validateDebtPayment } from '../lib/debts'
import { clearDeviceOnLogout, reconcileDevice } from '../lib/pushNotifications'
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Monitor, Moon, ShieldCheck, Sun } from 'lucide-react'
import { parseBackup, restoreBackup, type RestoreMode } from '../lib/backups'
import { emptyState } from '../data/emptyState'
import { fetchRemoteMeta, fetchRemoteState, getRememberRemoteSession, getRemoteOwnerId, readRemoteSession, refreshRemoteSession, remoteEnabled, saveRemoteSession, saveRemoteState, saveRemoteChanges, setRememberRemoteSession, signInRemote, signOutRemote, type RemoteSession, type RemoteStatus } from '../lib/remoteStore'
import { saveRentalMileage } from '../lib/mileage'
import { getNextPaymentDate } from '../lib/paymentReminders'
import { migrateLegacyMedia } from '../lib/legacyMediaMigration'
import { REMOTE_ACTIVE_WINDOW_MS, REMOTE_REFRESH_INTERVAL_MS, shouldPollRemote } from '../lib/syncPolicy'
import { applyLoginTheme, applyTheme, getSavedLoginThemeMode, getSavedTheme, saveLoginThemeMode, type ThemeMode } from '../lib/theme'
import type { ClientDebt, DebtPayment, AdminSettings, CalendarEvent, ClientDocument, Customer, Document, Fine, FleetState, MaintenanceRecord, Payment, Rental, Task, Vehicle, VehicleTax } from '../types'

export const STORAGE_KEY = 'monkey-rentals-flota:v4'
const LEGACY_STORAGE_KEYS = ['monkey-rentals-flota:v3','monkey-rentals-flota:v2']
const REMOTE_SAVE_DEBOUNCE_MS = 1200
const REMOTE_REFRESH_MIN_GAP_MS = 3000
type Entity = ClientDebt | DebtPayment | Vehicle | Customer | Rental | Payment | ClientDocument | Task | MaintenanceRecord | Document | VehicleTax | Fine | CalendarEvent
type Collection = 'debts' | 'debtPayments' | 'vehicles' | 'customers' | 'rentals' | 'payments' | 'clientDocuments' | 'tasks' | 'maintenance' | 'documents' | 'taxes' | 'fines' | 'events'
type Action =
  | { type:'dismissMileageAlert'; id:string }
  | { type:'saveRentalMileage'; rental:Rental; createCharge:boolean; today:string }
  | { type:'hydrate'; state:FleetState }
  | { type:'upsert'; collection:Collection; item:Entity }
  | { type:'remove'; collection:Collection; id:string }
  | { type:'toggleTask'; id:string }
  | { type:'markPaymentPaid'; id:string }
  | { type:'settings'; settings:AdminSettings }
  | { type:'reset' }

function reducer(state: FleetState, action: Action): FleetState {
  if (action.type === 'dismissMileageAlert') return { ...state, rentals:state.rentals.map(r => r.id === action.id ? {...r,mileageAlertDismissed:true} : r) }
  if (action.type === 'saveRentalMileage') return saveRentalMileage(state, action.rental, action.createCharge, action.today)
  if (action.type === 'hydrate') return action.state
  if (action.type === 'reset') return structuredClone(emptyState)
  if (action.type === 'settings') return { ...state, adminSettings: action.settings }
  if (action.type === 'toggleTask') return { ...state, tasks: state.tasks.map(t => t.id === action.id ? { ...t, completed: !t.completed } : t) }
  if (action.type === 'markPaymentPaid') {
    const payment = state.payments.find(item => item.id === action.id)
    if (!payment) return state
    const rental = state.rentals.find(item => item.id === payment.rentalId)
    const nextDate = payment.type === 'km_extra' ? null : getNextPaymentDate(payment)
    const nextPayment: Payment | null = rental?.status === 'activo' && nextDate ? {
      id: `payment-${Date.now()}`,
      rentalId: payment.rentalId,
      dueDate: nextDate,
      amount: rental.nextPaymentAmount || payment.amount || rental.agreedPrice,
      status: 'pendiente',
      type: payment.type,
      reminderEnabled: payment.reminderEnabled,
      reminderDate: nextDate,
      reminderFrequency: payment.reminderFrequency,
      recurrenceType: payment.recurrenceType,
      recurrenceInterval: payment.recurrenceInterval,
      isFlexible: payment.isFlexible,
      flexibleNotes: payment.flexibleNotes,
      method: payment.method,
      notes: '',
    } : null
    return {
      ...state,
      payments: [
        ...state.payments.map(item => item.id === action.id ? { ...item, status:'pagado' as const, paidDate:new Date().toISOString().slice(0,10) } : item),
        ...(nextPayment && !state.payments.some(item => item.rentalId === nextPayment.rentalId && item.dueDate === nextDate) ? [nextPayment] : []),
      ],
      rentals: state.rentals.map(item => item.id === payment.rentalId && nextDate ? { ...item, nextPaymentDate:nextDate } : item),
    }
  }
  if (action.type === 'remove') {
    if (action.collection === 'vehicles') {
      const rentalIds = state.rentals.filter(item => item.vehicleId === action.id).map(item => item.id)
      return { ...state, vehicles:state.vehicles.filter(item=>item.id!==action.id), rentals:state.rentals.filter(item=>item.vehicleId!==action.id), payments:state.payments.filter(item=>!rentalIds.includes(item.rentalId)), maintenance:state.maintenance.filter(item=>item.vehicleId!==action.id), documents:state.documents.filter(item=>item.vehicleId!==action.id), taxes:state.taxes.filter(item=>item.vehicleId!==action.id), fines:state.fines.filter(item=>item.vehicleId!==action.id) }
    }
    if (action.collection === 'customers') {
      const rentalIds = state.rentals.filter(item => item.customerId === action.id).map(item => item.id)
      return { ...state, customers:state.customers.filter(item=>item.id!==action.id), rentals:state.rentals.filter(item=>item.customerId!==action.id), payments:state.payments.filter(item=>!rentalIds.includes(item.rentalId)), clientDocuments:state.clientDocuments.filter(item=>item.customerId!==action.id), fines:state.fines.map(item=>item.customerId===action.id?{...item,customerId:undefined}:item) }
    }
    if (action.collection === 'rentals') return { ...state, rentals:state.rentals.filter(item=>item.id!==action.id), payments:state.payments.filter(item=>item.rentalId!==action.id) }
    return { ...state, [action.collection]: (state[action.collection] || []).filter(item => item.id !== action.id) }
  }
  const list = (state[action.collection] || []) as Entity[]
  const exists = list.some(item => item.id === action.item.id)
  return { ...state, [action.collection]: exists ? list.map(item => item.id === action.item.id ? action.item : item) : [action.item, ...list] }
}

function parseCachedState(stored: string | null | undefined): FleetState | null {
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as FleetState | Record<string, unknown>
    if (parsed.version === 4) return normalizeState(parsed as FleetState)
    if (parsed.version === 3) return migrateV3(parsed as unknown as Record<string, unknown>)
    if (parsed.version === 2) return migrateV2(parsed as unknown as Record<string, unknown>)
    return null
  } catch { return null }
}

function normalizeState(value: Partial<FleetState>): FleetState {
  return {
    ...structuredClone(emptyState),
    ...value,
    vehicles:Array.isArray(value.vehicles) ? value.vehicles : [],
    customers:Array.isArray(value.customers) ? value.customers : [],
    rentals:Array.isArray(value.rentals) ? value.rentals : [],
    payments:Array.isArray(value.payments) ? value.payments : [],
    debts:Array.isArray(value.debts) ? value.debts : [],
    debtPayments:Array.isArray(value.debtPayments) ? value.debtPayments : [],
    clientDocuments:Array.isArray(value.clientDocuments) ? value.clientDocuments : [],
    tasks:Array.isArray(value.tasks) ? value.tasks : [],
    maintenance:Array.isArray(value.maintenance) ? value.maintenance : [],
    documents:Array.isArray(value.documents) ? value.documents : [],
    taxes:Array.isArray(value.taxes) ? value.taxes : [],
    fines:Array.isArray(value.fines) ? value.fines : [],
    events:Array.isArray(value.events) ? value.events : [],
    adminSettings:value.adminSettings ?? emptyState.adminSettings,
    version:4,
  }
}

function storageKeyForSession(session: RemoteSession | null) {
  const ownerId = getRemoteOwnerId(session)
  return ownerId ? `${STORAGE_KEY}:user:${ownerId}` : STORAGE_KEY
}

function readCachedState(key: string, includeLegacy = true): FleetState | null {
  const stored = localStorage.getItem(key) ?? (includeLegacy ? LEGACY_STORAGE_KEYS.map(legacyKey=>localStorage.getItem(legacyKey)).find(Boolean) : undefined)
  return parseCachedState(stored)
}

function persistCachedState(key: string, nextState: FleetState) {
  const serialized = JSON.stringify(nextState)
  const cachedState = key.includes(':user:') ? {
    ...nextState,
    vehicles:nextState.vehicles.map(vehicle=>vehicle.image?.startsWith('data:image/')
      ? {...vehicle,image:'',[CACHED_IMAGE_OMITTED]:true}
      : vehicle),
  } : nextState
  const cachedSerialized=JSON.stringify(cachedState)
  try { localStorage.setItem(key,cachedSerialized) }
  catch {
    // A previous release cached embedded vehicle photos twice and could exhaust
    // the browser quota. Replace only this derived cache entry and keep syncing.
    try { localStorage.removeItem(key);localStorage.setItem(key,cachedSerialized) } catch { /* Remote data remains authoritative. */ }
  }
  return serialized
}

function initialState(session: RemoteSession | null = null): FleetState {
  if (remoteEnabled && session) return readCachedState(storageKeyForSession(session), false) ?? structuredClone(emptyState)
  if (remoteEnabled) return structuredClone(emptyState)
  return readCachedState(STORAGE_KEY) ?? structuredClone(emptyState)
}

function migrateV3(value: Record<string, unknown>): FleetState {
  return normalizeState({ ...(value as unknown as Partial<FleetState>), version:4, fines:[], clientDocuments:[] })
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
    clientDocuments:Array.isArray(value.clientDocuments) ? value.clientDocuments as ClientDocument[] : [],
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
  ownerId:string|null
  restoreFromBackup:(text:string,mode:RestoreMode)=>void
  rememberSession:boolean
  saveRental:(rental:Rental,createCharge:boolean)=>void
  saveRentalConfirmed:(rental:Rental,createCharge:boolean)=>Promise<void>
  upsert:(collection:Collection,item:Entity)=>void
  upsertConfirmed:(collection:Collection,item:Entity)=>Promise<void>
  remove:(collection:Collection,id:string)=>void
  dismissMileageAlert:(id:string)=>void
  toggleTask:(id:string)=>void
  markPaymentPaid:(id:string)=>void
  updateSettings:(settings:AdminSettings)=>void
  reset:()=>void
  signIn:(email:string,password:string,remember:boolean)=>Promise<void>
  signOut:()=>Promise<void>
  signOutEverywhere:()=>Promise<void>
  setRememberSession:(remember:boolean)=>void
  retrySync:()=>Promise<void>
}
const FleetContext = createContext<FleetContextValue | null>(null)

export function FleetProvider({ children }: { children: ReactNode }) {
  const [initialSession] = useState<RemoteSession|null>(() => remoteEnabled ? readRemoteSession() : null)
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(initialSession))
  const initialCache = useRef(state)
  const [session,setSession] = useState<RemoteSession|null>(() => initialSession)
  const initialSessionForValidation = useRef(initialSession)
  const [syncStatus,setSyncStatus] = useState<RemoteStatus>(() => remoteEnabled ? (initialSession ? 'loading' : 'login') : 'local')
  const [rememberSession,setRememberSessionState] = useState(() => getRememberRemoteSession())
  const [syncError,setSyncError] = useState('')
  const hydrated = useRef(!remoteEnabled)
  const skipNextSave = useRef(false)
  const remoteUpdatedAt = useRef<string>('')
  const lastSyncedState = useRef(JSON.stringify(state))
  const lastRefreshAt = useRef(0)
  const lastRemoteSuccessAt = useRef(0)
  const lastActivityAt = useRef(0)
  const hydrateRequestId = useRef(0)
  const stateRef = useRef(state)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { lastActivityAt.current = Date.now() }, [])

  const saving=useRef<Promise<void>|null>(null)
  const applyAction=useCallback((action:Action)=>{
    const next=reducer(stateRef.current,action)
    stateRef.current=next
    dispatch({type:'hydrate',state:next})
  },[])
  const persistChanges=useCallback(async (currentSession:RemoteSession)=>{
    if(saving.current)await saving.current
    const snapshot=stateRef.current
    const base=JSON.parse(lastSyncedState.current) as FleetState
    const work=(async()=>{
      const remote=await saveRemoteChanges(snapshot,base,currentSession,remoteUpdatedAt.current)
      if(getRemoteOwnerId(readRemoteSession())!==getRemoteOwnerId(currentSession))return
      lastRemoteSuccessAt.current=Date.now()
      const merged=mergeFleetState(snapshot,stateRef.current,remote.state)
      remoteUpdatedAt.current=remote.updated_at
      lastSyncedState.current=JSON.stringify(remote.state)
      persistCachedState(`${storageKeyForSession(currentSession)}:synced`,remote.state)
      if(JSON.stringify(merged)!==JSON.stringify(stateRef.current)){
        stateRef.current=merged;skipNextSave.current=true;dispatch({type:'hydrate',state:merged})
      }
    })()
    saving.current=work
    try {await work}finally{if(saving.current===work)saving.current=null}
  },[])


  useEffect(() => {
    if (!remoteEnabled) {
      applyTheme(getSavedTheme(), { persist: false })
      return
    }
    if (session) applyTheme(getSavedTheme(), { persist: false })
    else applyLoginTheme(getSavedLoginThemeMode())
  }, [session,persistChanges])

  const hydrateFromRemote = useCallback(async (currentSession = session) => {
    if (!remoteEnabled || !currentSession) return
    const requestId=++hydrateRequestId.current
    const cacheKey = storageKeyForSession(currentSession)
    setSyncStatus('loading')
    try {
      const remote = await fetchRemoteState(currentSession)
      if(requestId!==hydrateRequestId.current)return
      if (remote) {
        let remoteState = normalizeState(remote.state)
        const cached=readCachedState(cacheKey,false)
        const baseline=parseCachedState(localStorage.getItem(`${cacheKey}:synced`))
        // Keep the original comparison base if merging detects a conflict.
        // Treating the remote copy as that base would let a later retry overwrite it.
        if(baseline)lastSyncedState.current=JSON.stringify(baseline)
        let merged=cached&&baseline?mergeFleetState(baseline,cached,remoteState):remoteState
        if(merged.vehicles.some(vehicle=>vehicle.image?.startsWith('data:image/'))||merged.clientDocuments.some(document=>document.dataUrl?.startsWith('data:'))){
          const migration=await migrateLegacyMedia(merged)
          if(migration.migrated){
            const saved=await saveRemoteChanges(migration.state,remoteState,currentSession,remote.updated_at)
            remoteState=normalizeState(saved.state);merged=remoteState;remote.updated_at=saved.updated_at
          }
        }
        if(getRemoteOwnerId(readRemoteSession())!==getRemoteOwnerId(currentSession))return
        remoteUpdatedAt.current = remote.updated_at
        lastSyncedState.current = JSON.stringify(remoteState)
        persistCachedState(`${cacheKey}:synced`,remoteState)
        skipNextSave.current = true
        stateRef.current=merged
        dispatch({ type:'hydrate', state:merged })
        persistCachedState(cacheKey,merged)
      } else {
        const cachedState = readCachedState(cacheKey, false) ?? structuredClone(emptyState)
        initialCache.current = cachedState
        skipNextSave.current = true
        dispatch({ type:'hydrate', state:cachedState })
        lastSyncedState.current = persistCachedState(cacheKey, cachedState)
        remoteUpdatedAt.current = await saveRemoteState(cachedState, currentSession)
      }
      lastRemoteSuccessAt.current=Date.now()
      hydrated.current = true
      setSyncStatus('online')
      setSyncError('')
    } catch (error) {
      if(requestId!==hydrateRequestId.current)return
      hydrated.current = true
      if (!readRemoteSession()) {
        saveRemoteSession(null)
        setSession(null)
        setSyncStatus('login')
        setSyncError('La sesión ha caducado o se ha cerrado desde otro dispositivo.')
        return
      }
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
    if (remoteEnabled && !session) return
    const serializedState = persistCachedState(storageKeyForSession(session), state)
    if (!remoteEnabled || !session || !hydrated.current) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      if (serializedState === lastSyncedState.current) return
    }
    if (serializedState === lastSyncedState.current) {
      return
    }
    const timeout = window.setTimeout(async () => {
      setSyncStatus('saving')
      try {
        await persistChanges(session)
        setSyncStatus('online')
        setSyncError('')
      } catch (error) {
        setSyncStatus('offline')
        setSyncError(error instanceof Error ? error.message : 'Cambios guardados solo en caché local.')
      }
    }, REMOTE_SAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timeout)
  }, [state, session,persistChanges])

  useEffect(() => {
    if (!remoteEnabled || !session) return
    const markActivity=()=>{lastActivityAt.current=Date.now()}
    const refresh = async (force=false) => {
      const snapshot=stateRef.current
      const now = Date.now()
      if(!force&&!shouldPollRemote(now,lastActivityAt.current,document.hidden))return
      if(force&&document.hidden)return
      if (now - lastRefreshAt.current < REMOTE_REFRESH_MIN_GAP_MS) return
      lastRefreshAt.current = now
      try {
        if (JSON.stringify(snapshot)!==lastSyncedState.current) {
          await persistChanges(session)
          setSyncStatus('online')
          setSyncError('')
          return
        }
        const meta = await fetchRemoteMeta(session)
        if (meta?.updated_at && meta.updated_at !== remoteUpdatedAt.current) {
          const remote = await fetchRemoteState(session)
          if (!remote || stateRef.current!==snapshot) return
          const remoteState = normalizeState(remote.state)
          remoteUpdatedAt.current = remote.updated_at
          lastSyncedState.current = JSON.stringify(remoteState)
          skipNextSave.current = true
          stateRef.current = remoteState
          dispatch({ type:'hydrate', state:remoteState })
          persistCachedState(storageKeyForSession(session),remoteState)
          persistCachedState(`${storageKeyForSession(session)}:synced`,remoteState)
        }
        lastRemoteSuccessAt.current=Date.now()
        setSyncStatus('online')
        setSyncError('')
      } catch (error) {
        if (!readRemoteSession()) {
          setSession(null)
          setSyncStatus('login')
          setSyncError('La sesión ha caducado o se ha cerrado desde otro dispositivo.')
          return
        }
        setSyncStatus('offline')
        setSyncError(error instanceof Error ? error.message : 'No se ha podido comprobar la sincronización remota.')
      }
    }
    const onFocus = () => { if (!document.hidden) void refresh(true) }
    const onOnline = () => { if (!document.hidden) void refresh(true) }
    for(const event of ['pointerdown','keydown','touchstart'] as const)window.addEventListener(event,markActivity,{passive:true})
    window.addEventListener('focus', onFocus)
    window.addEventListener('online',onOnline)
    document.addEventListener('visibilitychange', onFocus)
    const interval = window.setInterval(()=>void refresh(false), REMOTE_REFRESH_INTERVAL_MS)
    return () => { for(const event of ['pointerdown','keydown','touchstart'] as const)window.removeEventListener(event,markActivity);window.removeEventListener('focus', onFocus);window.removeEventListener('online',onOnline);document.removeEventListener('visibilitychange', onFocus);window.clearInterval(interval) }
  }, [session,persistChanges])

  useEffect(()=>{
    const owner=getRemoteOwnerId(session)
    if(!owner)return
    const reconcile=()=>{if(!document.hidden)void reconcileDevice(owner).catch(()=>{})}
    reconcile();window.addEventListener('focus',reconcile)
    return()=>window.removeEventListener('focus',reconcile)
  },[session])

  const signIn = useCallback(async (email:string,password:string,remember:boolean) => {
    setSyncStatus('loading')
    try {
      const nextSession = await signInRemote(email,password)
      setRememberRemoteSession(remember)
      saveRemoteSession(nextSession, remember)
      setRememberSessionState(remember)
      const cacheKey = storageKeyForSession(nextSession)
      const cachedState = readCachedState(cacheKey, false) ?? structuredClone(emptyState)
      initialCache.current = cachedState
      remoteUpdatedAt.current = ''
      lastSyncedState.current = JSON.stringify(cachedState)
      lastRefreshAt.current = 0
      hydrated.current = false
      skipNextSave.current = true
      stateRef.current = cachedState
      dispatch({ type:'hydrate', state:cachedState })
      persistCachedState(cacheKey,cachedState)
      setSyncError('')
      setSession(nextSession)
    } catch (error) {
      setSyncStatus('login')
      setSyncError(error instanceof Error ? error.message : 'No se ha podido iniciar sesión.')
      throw error
    }
  }, [])

  const clearRemoteLogin = useCallback((message = '') => {
    void clearDeviceOnLogout().catch(()=>{ /* Browser may be offline; backend also checks the auth session. */ })
    saveRemoteSession(null)
    initialCache.current = structuredClone(emptyState)
    remoteUpdatedAt.current = ''
    lastSyncedState.current = JSON.stringify(emptyState)
    lastRefreshAt.current = 0
    hydrated.current = !remoteEnabled
    skipNextSave.current = true
    const clearedState=structuredClone(emptyState)
    stateRef.current=clearedState
    dispatch({ type:'hydrate', state:clearedState })
    setSession(null)
    setSyncStatus(remoteEnabled ? 'login' : 'local')
    setSyncError(message)
  }, [])

  const signOut = useCallback(async () => {
    const currentSession = session
    clearRemoteLogin()
    if (!remoteEnabled || !currentSession) return
    try { await signOutRemote(currentSession, 'local') } catch { /* La salida local debe completarse aunque falle la red. */ }
  }, [clearRemoteLogin, session])

  const signOutEverywhere = useCallback(async () => {
    if (!remoteEnabled || !session) {
      clearRemoteLogin()
      return
    }
    await signOutRemote(session, 'global')
    clearRemoteLogin('Sesión cerrada en todos los dispositivos. Vuelve a iniciar sesión para continuar.')
  }, [clearRemoteLogin, session])

  useEffect(() => {
    const storedSession = initialSessionForValidation.current
    if (!remoteEnabled || !storedSession?.refreshToken) return
    let cancelled = false
    const validationStartedAt=Date.now()
    const validate = async () => {
      const nextSession = await refreshRemoteSession(storedSession)
      if (cancelled) return
      if (nextSession) setSession(nextSession)
      else clearRemoteLogin('La sesión ha caducado o se ha cerrado desde otro dispositivo.')
    }
    void validate().catch(()=>{if(!cancelled&&lastRemoteSuccessAt.current<=validationStartedAt){setSyncStatus('offline');setSyncError('No se ha podido comprobar la sesión. Se conserva la caché hasta recuperar la conexión.')}})
    return () => { cancelled = true }
  }, [clearRemoteLogin])

  const setRememberSession = useCallback((remember:boolean) => {
    setRememberRemoteSession(remember)
    setRememberSessionState(remember)
    if (!remember) {
      clearRemoteLogin()
    } else if (session) saveRemoteSession(session, true)
  }, [clearRemoteLogin, session])

  const retrySync = useCallback(async () => {
    if (session && hydrated.current && JSON.stringify(stateRef.current)!==lastSyncedState.current) {
        setSyncStatus('saving')
      try {
        await persistChanges(session)
        setSyncStatus('online');setSyncError('')
      } catch(error) {
        setSyncStatus('offline');setSyncError(error instanceof Error?error.message:'No se han podido sincronizar los cambios.')
      }
    } else await hydrateFromRemote(session)
  }, [hydrateFromRemote, session,persistChanges])

  const confirmAction = useCallback(async (action:Action) => {
    if (!remoteEnabled) { applyAction(action); return }
    if (!session || !hydrated.current) throw new Error('No hay conexión activa con la cuenta. Recupera la conexión antes de guardar.')
    applyAction(action)
    setSyncStatus('saving')
    try {
      await persistChanges(session)
      setSyncStatus('online');setSyncError('')
    } catch (error) {
      const message=error instanceof Error?error.message:'No se ha podido confirmar el guardado en Supabase.'
      setSyncStatus('offline');setSyncError(message)
      throw new Error(message)
    }
  },[applyAction,persistChanges,session])

  useEffect(()=>{
    if(!session||syncStatus!=='offline')return
    const retry=()=>{if(!document.hidden&&Date.now()-lastActivityAt.current<=REMOTE_ACTIVE_WINDOW_MS)void retrySync()}
    const online=()=>{if(!document.hidden)void retrySync()}
    window.addEventListener('online',online)
    const interval=window.setInterval(retry,60000)
    return()=>{window.removeEventListener('online',online);window.clearInterval(interval)}
  },[session,syncStatus,retrySync])

  const value = useMemo(() => ({
    state, syncStatus, syncError, remoteEnabled, authEmail:session?.email, rememberSession,
    ownerId:getRemoteOwnerId(session),
    restoreFromBackup:(text:string,mode:RestoreMode)=>{
      const owner=getRemoteOwnerId(session)
      if (!owner || getRemoteOwnerId(readRemoteSession())!==owner || syncStatus==='loading' || syncStatus==='saving') throw new Error('Espera a que termine la sincronización e inicia sesión antes de restaurar.')
      const backup=parseBackup(text,owner)
      const restored=restoreBackup(stateRef.current,backup,mode)
      persistCachedState(storageKeyForSession(session),restored)
      stateRef.current=restored
      dispatch({type:'hydrate',state:restored})
    },
    saveRental:(rental:Rental,createCharge:boolean)=>{
      const today = new Date().toISOString().slice(0,10)
      applyAction({type:'saveRentalMileage',rental,createCharge,today})
    },
    saveRentalConfirmed:async(rental:Rental,createCharge:boolean)=>{
      const today = new Date().toISOString().slice(0,10)
      await confirmAction({type:'saveRentalMileage',rental,createCharge,today})
    },
    upsert:(collection:Collection,item:Entity)=>{if(collection==='debtPayments')validateDebtPayment(stateRef.current,item as DebtPayment);applyAction({type:'upsert',collection,item})},
    upsertConfirmed:async(collection:Collection,item:Entity)=>{if(collection==='debtPayments')validateDebtPayment(stateRef.current,item as DebtPayment);await confirmAction({type:'upsert',collection,item})},
    remove:(collection:Collection,id:string)=>applyAction({type:'remove',collection,id}),
    dismissMileageAlert:(id:string)=>applyAction({type:'dismissMileageAlert',id}),
    toggleTask:(id:string)=>applyAction({type:'toggleTask',id}),
    markPaymentPaid:(id:string)=>applyAction({type:'markPaymentPaid',id}),
    updateSettings:(settings:AdminSettings)=>applyAction({type:'settings',settings}),
    reset:()=>applyAction({type:'reset'}),
    signIn, signOut, signOutEverywhere, setRememberSession, retrySync,
  }), [state, syncStatus, syncError, session, rememberSession, applyAction, confirmAction, signIn, signOut, signOutEverywhere, setRememberSession, retrySync])
  return <FleetContext.Provider value={value}>{remoteEnabled && !session ? <LoginScreen error={syncError} onSubmit={signIn}/> : children}</FleetContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFleet() { const context = useContext(FleetContext); if (!context) throw new Error('useFleet requiere FleetProvider'); return context }

const loginThemeOptions = [
  { value:'light', label:'Claro', icon:Sun },
  { value:'dark', label:'Oscuro', icon:Moon },
  { value:'system', label:'Sistema', icon:Monitor },
] as const

function LoginScreen({error,onSubmit}:{error:string;onSubmit:(email:string,password:string,remember:boolean)=>Promise<void>}) {
  const [message,setMessage]=useState(error)
  const [loading,setLoading]=useState(false)
  const [themeMode,setThemeMode]=useState<ThemeMode>(()=>getSavedLoginThemeMode())
  const [remember,setRemember]=useState(()=>getRememberRemoteSession())
  useEffect(()=>{
    applyLoginTheme(themeMode)
    if (themeMode !== 'system' || typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => applyLoginTheme('system')
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [themeMode])
  const chooseTheme=(mode:ThemeMode)=>{
    setThemeMode(mode)
    saveLoginThemeMode(mode)
    applyLoginTheme(mode)
  }
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    const form=new FormData(event.currentTarget)
    setLoading(true)
    setMessage('')
    try { await onSubmit(String(form.get('email')),String(form.get('password')),remember) }
    catch (err) { setMessage(err instanceof Error ? err.message : 'No se ha podido iniciar sesión.') }
    finally { setLoading(false) }
  }
  return <main className="login-screen grid min-h-dvh place-items-center bg-cream p-4">
    <form onSubmit={submit} className="login-card card w-full max-w-md p-6 sm:p-8">
      <img src="/monkey-rentals-logo.png" alt="" className="mx-auto size-20 object-contain"/>
      <h1 className="mt-4 text-center font-display text-2xl font-bold text-ink">Acceso Monkey Rentals</h1>
      <p className="mt-2 text-center text-sm text-stone-500">Inicia sesión para sincronizar la flota en todos los dispositivos.</p>
      <div className="login-theme-switcher mt-5" role="group" aria-label="Aspecto del login">
        {loginThemeOptions.map(({value,label,icon:Icon})=><button key={value} type="button" className="login-theme-button" aria-pressed={themeMode===value} onClick={()=>chooseTheme(value)}>
          <Icon size={15} aria-hidden="true"/>
          <span>{label}</span>
        </button>)}
      </div>
      {message&&<p role="alert" className="login-error mt-5 rounded-xl p-3 text-sm font-semibold">{message}</p>}
      <label className="mt-5 block"><span className="label">Email</span><input className="field" name="email" type="email" autoComplete="email" required/></label>
      <label className="mt-4 block"><span className="label">Contraseña</span><input className="field" name="password" type="password" autoComplete="current-password" required/></label>
      <label className="login-remember mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-3.5">
        <input className="sr-only" type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)}/>
        <span className="login-switch" aria-hidden="true"><span/></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-extrabold text-ink"><ShieldCheck size={16}/> Mantener sesión abierta</span>
          <span className="mt-1 block text-xs leading-5 text-stone-500">Mantener sesión abierta afecta solo a este dispositivo.</span>
        </span>
      </label>
      <button className="btn-primary mt-6 w-full" disabled={loading}>{loading?'Conectando...':'Entrar'}</button>
    </form>
  </main>
}
