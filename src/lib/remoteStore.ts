import type { FleetState } from '../types'

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

export async function refreshRemoteSession(session: RemoteSession): Promise<RemoteSession | null> {
  if (!session.refreshToken) return null
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  })
  if (!response.ok) {
    saveRemoteSession(null)
    return null
  }
  const nextSession = parseSession(await response.json(), session.email)
  const normalizedSession = { ...nextSession, userId:nextSession.userId || session.userId }
  saveRemoteSession(normalizedSession)
  return normalizedSession
}

export async function signOutRemote(session: RemoteSession, scope: RemoteSignOutScope = 'local'): Promise<void> {
  const response = await fetch(`${config.url}/auth/v1/logout?scope=${scope}`, {
    method: 'POST',
    headers: headers(session),
  })
  if (!response.ok) throw new Error(scope === 'global'
    ? 'No se ha podido cerrar la sesión en todos los dispositivos.'
    : 'No se ha podido cerrar la sesión remota.')
}

async function authedFetch(url: string, session: RemoteSession, init: RequestInit = {}, extraHeaders: Record<string, string> = {}) {
  const currentSession = session
  const request = (nextSession: RemoteSession) => fetch(url, { ...init, headers: headers(nextSession, extraHeaders) })
  const response = await request(currentSession)
  if (response.status !== 401) return response
  const refreshedSession = await refreshRemoteSession(currentSession)
  return refreshedSession ? request(refreshedSession) : response
}

export async function signInRemote(email: string, password: string): Promise<RemoteSession> {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error('No se ha podido iniciar sesión con Supabase.')
  return parseSession(await response.json(), email)
}

export async function fetchRemoteState(session: RemoteSession): Promise<RemoteRow | null> {
  const ownerId = requireRemoteOwnerId(session)
  const response = await authedFetch(restUrl(`?user_id=eq.${encodeURIComponent(ownerId)}&select=state,updated_at,user_id&limit=1`), session)
  if (!response.ok) throw new Error('No se han podido cargar los datos remotos.')
  const rows = await response.json() as RemoteRow[]
  return rows[0] || null
}

export async function saveRemoteState(state: FleetState, session: RemoteSession): Promise<string> {
  const ownerId = requireRemoteOwnerId(session)
  const updatedAt = new Date().toISOString()
  const response = await authedFetch(restUrl('?on_conflict=user_id'), session, {
    method: 'POST',
    body: JSON.stringify([{ id:remoteRowId(ownerId), user_id:ownerId, state, updated_at:updatedAt }]),
  }, { Prefer: 'resolution=merge-duplicates,return=representation' })
  if (!response.ok) throw new Error('No se han podido guardar los datos remotos.')
  const rows = await response.json() as RemoteRow[]
  return rows[0]?.updated_at || updatedAt
}
