import type { FleetState } from '../types'

export interface RemoteSession {
  accessToken: string
  refreshToken?: string
  email?: string
  expiresAt?: number
}

export type RemoteStatus = 'local' | 'login' | 'loading' | 'online' | 'saving' | 'offline' | 'error'

interface RemoteRow {
  state: FleetState
  updated_at: string
}

export const REMOTE_SESSION_KEY = 'monkey-rentals:supabase-session'

const env = import.meta.env
const config = {
  url: String(env.VITE_SUPABASE_URL || '').replace(/\/$/, ''),
  anonKey: String(env.VITE_SUPABASE_ANON_KEY || ''),
  companyId: String(env.VITE_MONKEY_COMPANY_ID || 'monkey-rentals'),
  table: String(env.VITE_MONKEY_STATE_TABLE || 'fleet_state'),
}

export const remoteEnabled = Boolean(config.url && config.anonKey)

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
    const stored = localStorage.getItem(REMOTE_SESSION_KEY)
    return stored ? JSON.parse(stored) as RemoteSession : null
  } catch {
    return null
  }
}

export function saveRemoteSession(session: RemoteSession | null) {
  if (session) localStorage.setItem(REMOTE_SESSION_KEY, JSON.stringify(session))
  else localStorage.removeItem(REMOTE_SESSION_KEY)
}

function parseSession(data: { access_token:string; refresh_token?:string; expires_at?:number; user?:{ email?:string } }, fallbackEmail?: string): RemoteSession {
  return { accessToken:data.access_token, refreshToken:data.refresh_token, expiresAt:data.expires_at, email:data.user?.email || fallbackEmail }
}

async function refreshRemoteSession(session: RemoteSession): Promise<RemoteSession | null> {
  if (!session.refreshToken) return null
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  })
  if (!response.ok) return null
  const nextSession = parseSession(await response.json(), session.email)
  saveRemoteSession(nextSession)
  return nextSession
}

async function authedFetch(url: string, session: RemoteSession, init: RequestInit = {}, extraHeaders: Record<string, string> = {}) {
  const currentSession = readRemoteSession() || session
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
  const response = await authedFetch(restUrl(`?id=eq.${encodeURIComponent(config.companyId)}&select=state,updated_at&limit=1`), session)
  if (!response.ok) throw new Error('No se han podido cargar los datos remotos.')
  const rows = await response.json() as RemoteRow[]
  return rows[0] || null
}

export async function saveRemoteState(state: FleetState, session: RemoteSession): Promise<string> {
  const updatedAt = new Date().toISOString()
  const response = await authedFetch(restUrl('?on_conflict=id'), session, {
    method: 'POST',
    body: JSON.stringify([{ id:config.companyId, state, updated_at:updatedAt }]),
  }, { Prefer: 'resolution=merge-duplicates,return=representation' })
  if (!response.ok) throw new Error('No se han podido guardar los datos remotos.')
  const rows = await response.json() as RemoteRow[]
  return rows[0]?.updated_at || updatedAt
}

export function hasBusinessData(state: FleetState) {
  return state.vehicles.length > 0 || state.customers.length > 0 || state.rentals.length > 0 ||
    state.payments.length > 0 || state.tasks.length > 0 || state.maintenance.length > 0 ||
    state.documents.length > 0 || state.taxes.length > 0 || state.fines.length > 0 || state.events.length > 0
}
