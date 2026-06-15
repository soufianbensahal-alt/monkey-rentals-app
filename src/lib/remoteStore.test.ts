import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyState } from '../data/emptyState'

describe('remoteStore', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    vi.stubEnv('VITE_MONKEY_COMPANY_ID', 'monkey-rentals')
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('inicia sesión con Supabase Auth y conserva el email', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'token-1', refresh_token: 'refresh-1', user: { email: 'hola@monkey.test' } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { signInRemote } = await import('./remoteStore')

    const session = await signInRemote('hola@monkey.test', 'secret')

    expect(session).toMatchObject({ accessToken: 'token-1', refreshToken: 'refresh-1', email: 'hola@monkey.test' })
    expect(fetchMock).toHaveBeenCalledWith('https://supabase.test/auth/v1/token?grant_type=password', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'hola@monkey.test', password: 'secret' }),
    }))
  })

  it('lee y guarda el estado compartido de la flota', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ state: emptyState, updated_at: '2026-06-15T10:00:00.000Z' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ updated_at: '2026-06-15T10:01:00.000Z' }],
      })
    vi.stubGlobal('fetch', fetchMock)
    const { fetchRemoteState, saveRemoteState } = await import('./remoteStore')

    const row = await fetchRemoteState({ accessToken: 'token-1' })
    const updatedAt = await saveRemoteState(emptyState, { accessToken: 'token-1' })

    expect(row?.updated_at).toBe('2026-06-15T10:00:00.000Z')
    expect(updatedAt).toBe('2026-06-15T10:01:00.000Z')
    expect(fetchMock).toHaveBeenLastCalledWith('https://supabase.test/rest/v1/fleet_state?on_conflict=id', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token-1', Prefer: 'resolution=merge-duplicates,return=representation' }),
    }))
  })

  it('mantiene la sesión remota en localStorage solo como credencial de acceso', async () => {
    const { readRemoteSession, saveRemoteSession } = await import('./remoteStore')

    saveRemoteSession({ accessToken: 'token-1', email: 'hola@monkey.test' })

    expect(readRemoteSession()?.email).toBe('hola@monkey.test')
    saveRemoteSession(null)
    expect(readRemoteSession()).toBeNull()
  })

  it('refresca el token caducado y reintenta la lectura', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token-2', refresh_token: 'refresh-2', user: { email: 'hola@monkey.test' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ state: emptyState, updated_at: '2026-06-15T10:00:00.000Z' }],
      })
    vi.stubGlobal('fetch', fetchMock)
    const { fetchRemoteState, readRemoteSession, saveRemoteSession } = await import('./remoteStore')
    saveRemoteSession({ accessToken: 'token-1', refreshToken: 'refresh-1', email: 'hola@monkey.test' })

    const row = await fetchRemoteState({ accessToken: 'token-1', refreshToken: 'refresh-1' })

    expect(row?.updated_at).toBe('2026-06-15T10:00:00.000Z')
    expect(readRemoteSession()?.accessToken).toBe('token-2')
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://supabase.test/auth/v1/token?grant_type=refresh_token', expect.objectContaining({
      body: JSON.stringify({ refresh_token: 'refresh-1' }),
    }))
  })
})
