import type { FleetState } from '../types'
import { trackedFetch } from './egressDiagnostics'

export interface RemoteSession {
  accessToken: string
  refreshToken?: string
  email?: string
  expiresAt?: number
  userId?: string
}

export type RemoteStatus = 'local' | 'login' | 'loading' | 'online' | 'saving' | 'offline' | 'error'
export type RemoteSignOutScope = 'local' | 'global'

interface RemoteRow {
  state: FleetState
  updated_at: string
  user_id?: string
}

export interface RemoteMeta {
  updated_at: string
  user_id?: string
}

export const REMOTE_SESSION_KEY = 'monkey-rentals:supabase-session'
export const REMOTE_REMEMBER_KEY = 'monkey-rentals:remember-session'

const env = import.meta.env
const config = {
  url: String(env.VITE_SUPABASE_URL || '').replace(/\/$/, ''),
  anonKey: String(env.VITE_SUPABASE_ANON_KEY || ''),
  table: String(env.VITE_MONKEY_STATE_TABLE || 'fleet_state'),
}

export const remoteEnabled = Boolean(config.url && config.anonKey)

export function getRememberRemoteSession() {
  return localStorage.getItem(REMOTE_REMEMBER_KEY) !== 'false'
}

export function setRememberRemoteSession(remember: boolean) {
  localStorage.setItem(REMOTE_REMEMBER_KEY, remember ? 'true' : 'false')
  if (!remember) localStorage.removeItem(REMOTE_SESSION_KEY)
  else {
    const session = sessionStorage.getItem(REMOTE_SESSION_KEY)
    if (session) {
      localStorage.setItem(REMOTE_SESSION_KEY, session)
      sessionStorage.removeItem(REMOTE_SESSION_KEY)
    }
  }
}

function headers(session?: RemoteSession, extraHeaders: Record<string, string> = {}) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${session?.accessToken || config.anonKey}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  }
}

function restUrl(query = '') {
  return `${config.url}/rest/v1/${config.table}${query}`
}

function ownerQuery(session: RemoteSession) {
  return `user_id=eq.${encodeURIComponent(requireRemoteOwnerId(session))}`
}

export function readRemoteSession(): RemoteSession | null {
  try {
    const stored = getRememberRemoteSession() ? localStorage.getItem(REMOTE_SESSION_KEY) : sessionStorage.getItem(REMOTE_SESSION_KEY)
    if (!stored) return null
    const session = JSON.parse(stored) as RemoteSession
    const userId = getRemoteOwnerId(session)
    return userId && session.userId !== userId ? { ...session, userId } : session
  } catch {
    return null
  }
}

export function saveRemoteSession(session: RemoteSession | null, remember = getRememberRemoteSession()) {
  if (!session) {
    localStorage.removeItem(REMOTE_SESSION_KEY)
    sessionStorage.removeItem(REMOTE_SESSION_KEY)
    return
  }
  const targetStorage = remember ? localStorage : sessionStorage
  const staleStorage = remember ? sessionStorage : localStorage
  targetStorage.setItem(REMOTE_SESSION_KEY, JSON.stringify(session))
  staleStorage.removeItem(REMOTE_SESSION_KEY)
}

function decodeJwtPayload(token?: string): Record<string, unknown> | null {
  if (!token) return null
  const payload = token.split('.')[1]
  if (!payload || typeof atob !== 'function') return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function getRemoteOwnerId(session: RemoteSession | null | undefined): string | null {
  if (!session) return null
  if (session.userId) return session.userId
  const sub = decodeJwtPayload(session.accessToken)?.sub
  return typeof sub === 'string' && sub.trim() ? sub : null
}

function requireRemoteOwnerId(session: RemoteSession) {
  const ownerId = getRemoteOwnerId(session)
  if (!ownerId) throw new Error('No se ha podido identificar el usuario autenticado para aislar sus datos.')
  return ownerId
}

function remoteRowId(ownerId: string) {
  return `user:${ownerId}`
}

function parseSession(data: { access_token:string; refresh_token?:string; expires_at?:number; user?:{ id?:string; email?:string } }, fallbackEmail?: string): RemoteSession {
  const session = { accessToken:data.access_token, refreshToken:data.refresh_token, expiresAt:data.expires_at, email:data.user?.email || fallbackEmail, userId:data.user?.id }
  return { ...session, userId:getRemoteOwnerId(session) || undefined }
}

let refreshInFlight: {owner:string|null; promise:Promise<RemoteSession|null>} | undefined
export async function refreshRemoteSession(session: RemoteSession): Promise<RemoteSession | null> {
  const owner=getRemoteOwnerId(session)
  if(refreshInFlight?.owner===owner)return refreshInFlight.promise
  const promise=performRefresh(session)
  refreshInFlight={owner,promise}
  try {return await promise}finally{if(refreshInFlight?.promise===promise)refreshInFlight=undefined}
}
async function performRefresh(session:RemoteSession):Promise<RemoteSession|null> {
  const latest=readRemoteSession()
  if(latest && getRemoteOwnerId(latest)===getRemoteOwnerId(session))session=latest
  if (!session.refreshToken) return null
  const response = await trackedFetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  })
  if (!response.ok) {
    if(response.status>=500||response.status===429)throw new Error('No se puede renovar la sesión temporalmente. Inténtalo de nuevo.')
    saveRemoteSession(null)
    return null
  }
  const nextSession = parseSession(await response.json(), session.email)
  const normalizedSession = { ...nextSession, userId:nextSession.userId || session.userId }
  saveRemoteSession(normalizedSession)
  return normalizedSession
}

export async function signOutRemote(session: RemoteSession, scope: RemoteSignOutScope = 'local'): Promise<void> {
  const response = await trackedFetch(`${config.url}/auth/v1/logout?scope=${scope}`, {
    method: 'POST',
    headers: headers(session),
  })
  if (!response.ok) throw new Error(scope === 'global'
    ? 'No se ha podido cerrar la sesión en todos los dispositivos.'
    : 'No se ha podido cerrar la sesión remota.')
}

async function authedFetch(url: string, session: RemoteSession, init: RequestInit = {}, extraHeaders: Record<string, string> = {}) {
  const latest=readRemoteSession()
  const currentSession = latest && getRemoteOwnerId(latest)===getRemoteOwnerId(session) ? latest : session
  const request = (nextSession: RemoteSession) => trackedFetch(url, { ...init, headers: headers(nextSession, extraHeaders) })
  const response = await request(currentSession)
  if (response.status !== 401) return response
  const refreshedSession = await refreshRemoteSession(currentSession)
  return refreshedSession ? request(refreshedSession) : response
}

export async function signInRemote(email: string, password: string): Promise<RemoteSession> {
  const response = await trackedFetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error('No se ha podido iniciar sesión con Supabase.')
  return parseSession(await response.json(), email)
}

export async function fetchRemoteState(session: RemoteSession): Promise<RemoteRow | null> {
  const response = await authedFetch(restUrl(`?${ownerQuery(session)}&select=state,updated_at,user_id&limit=1`), session)
  if (!response.ok) throw new Error('No se han podido cargar los datos remotos.')
  const rows = await response.json() as RemoteRow[]
  return rows[0] || null
}

export async function fetchRemoteMeta(session: RemoteSession): Promise<RemoteMeta | null> {
  const response = await authedFetch(restUrl(`?${ownerQuery(session)}&select=updated_at,user_id&limit=1`), session)
  if (!response.ok) throw new Error('No se ha podido comprobar el estado remoto.')
  const rows = await response.json() as RemoteMeta[]
  return rows[0] || null
}

export async function saveRemoteState(state: FleetState, session: RemoteSession): Promise<string> {
  const ownerId = requireRemoteOwnerId(session)
  const updatedAt = new Date().toISOString()
  const response = await authedFetch(restUrl('?on_conflict=user_id'), session, {
    method: 'POST',
    body: JSON.stringify([{ id:remoteRowId(ownerId), user_id:ownerId, state, updated_at:updatedAt }]),
  }, { Prefer: 'resolution=merge-duplicates,return=minimal' })
  if (!response.ok) throw new Error('No se han podido guardar los datos remotos.')
  return updatedAt
}

export async function callNotificationService(body:Record<string,unknown>) {
  const session=readRemoteSession()
  if(!session || !remoteEnabled)throw new Error('Inicia sesión para configurar las notificaciones.')
  const response=await authedFetch(`${config.url}/functions/v1/notification-device`,session,{method:'POST',body:JSON.stringify(body)})
  if(!response.ok)throw new Error('El servicio de notificaciones no está disponible. Revisa su configuración o inténtalo de nuevo.')
  return response.json() as Promise<{publicKey?:string;active?:boolean;devices?:{id:string;device_name:string;platform:string;active:boolean;last_used_at?:string}[];deliveries?:{delivery_key:string;title:string;scheduled_at:string;status:string;attempts:number;error_code?:string;notification_sent_at?:string}[]}>
}

export async function privateStorage(path:string,init:RequestInit={}) {
  const session=readRemoteSession()
  if(!session||!remoteEnabled)throw new Error('Inicia sesión y conecta con Supabase para guardar archivos.')
  const response=await authedFetch(`${config.url}/storage/v1/${path}`,session,init,init.body instanceof Blob?{'Content-Type':init.body.type}:{})
  if(!response.ok)throw new Error('No se ha podido acceder al archivo privado. Comprueba la conexión y vuelve a intentarlo.')
  return response
}
export function storageSignedUrl(path:string) {return `${config.url}/storage/v1${path}`}

export async function privateTable(table:string,query:string,init:RequestInit={}) {
  const session=readRemoteSession()
  if(!session||!remoteEnabled)throw new Error('Inicia sesión y conecta con Supabase para guardar archivos.')
  const response=await authedFetch(`${config.url}/rest/v1/${table}${query}`,session,init,{Prefer:init.method==='POST'?'resolution=merge-duplicates,return=minimal':'return=minimal'})
  if(!response.ok)throw new Error('No se han podido guardar los datos del archivo privado.')
  return response
}

async function patchRemoteState(state:FleetState,session:RemoteSession,previousUpdatedAt:string):Promise<RemoteRow|null> {
  const updatedAt=new Date(Math.max(Date.now(),Date.parse(previousUpdatedAt)+1)).toISOString()
  const response=await authedFetch(restUrl(`?${ownerQuery(session)}&updated_at=eq.${encodeURIComponent(previousUpdatedAt)}&select=updated_at,user_id`),session,{method:'PATCH',body:JSON.stringify({state,updated_at:updatedAt})},{Prefer:'return=representation'})
  if(!response.ok)throw new Error('No se han podido sincronizar los cambios. Se conservan en la caché local.')
  const rows=await response.json() as RemoteMeta[]
  return rows[0]?{state,updated_at:rows[0].updated_at,user_id:rows[0].user_id}:null
}

export async function saveRemoteChanges(state:FleetState,base:FleetState,session:RemoteSession,expectedUpdatedAt=''):Promise<RemoteRow> {
  const {mergeFleetState}=await import('./stateMerge')
  if(expectedUpdatedAt){
    const saved=await patchRemoteState(state,session,expectedUpdatedAt)
    if(saved)return saved
  }
  for(let attempt=0;attempt<3;attempt++){
    const remote=await fetchRemoteState(session)
    if(!remote){return {state,updated_at:await saveRemoteState(state,session)}}
    const merged=mergeFleetState(base,state,remote.state)
    const saved=await patchRemoteState(merged,session,remote.updated_at)
    if(saved)return saved
  }
  throw new Error('Hay cambios simultáneos en otro dispositivo. Intenta sincronizar de nuevo.')
}
