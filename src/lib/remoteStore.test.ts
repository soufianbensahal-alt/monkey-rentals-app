import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyState } from '../data/emptyState'

describe('remoteStore', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('inicia sesión con Supabase Auth y conserva el email', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'token-1', refresh_token: 'refresh-1', user: { id:'user-a', email: 'hola@monkey.test' } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { signInRemote } = await import('./remoteStore')

    const session = await signInRemote('hola@monkey.test', 'secret')

    expect(session).toMatchObject({ accessToken: 'token-1', refreshToken: 'refresh-1', email: 'hola@monkey.test', userId:'user-a' })
    expect(fetchMock).toHaveBeenCalledWith('https://supabase.test/auth/v1/token?grant_type=password', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'hola@monkey.test', password: 'secret' }),
    }))
  })

  it('lee y guarda el estado aislado por usuario', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ state: emptyState, updated_at: '2026-06-15T10:00:00.000Z', user_id:'user-a' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ updated_at: '2026-06-15T10:01:00.000Z' }],
      })
    vi.stubGlobal('fetch', fetchMock)
    const { fetchRemoteState, saveRemoteState } = await import('./remoteStore')

    const row = await fetchRemoteState({ accessToken: 'token-1', userId:'user-a' })
    const updatedAt = await saveRemoteState(emptyState, { accessToken: 'token-1', userId:'user-a' })

    expect(row?.updated_at).toBe('2026-06-15T10:00:00.000Z')
    expect(updatedAt).toBe('2026-06-15T10:01:00.000Z')
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://supabase.test/rest/v1/fleet_state?user_id=eq.user-a&select=state,updated_at,user_id&limit=1', expect.any(Object))
    expect(fetchMock).toHaveBeenLastCalledWith('https://supabase.test/rest/v1/fleet_state?on_conflict=user_id', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token-1', Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: expect.stringContaining('"user_id":"user-a"'),
    }))
  })

  it('rechaza lecturas remotas sin usuario identificable', async () => {
    const { fetchRemoteState } = await import('./remoteStore')

    await expect(fetchRemoteState({ accessToken:'token-sin-sub' })).rejects.toThrow('usuario autenticado')
  })

  it('usa filas remotas distintas para usuarios distintos', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ updated_at: '2026-06-15T10:01:00.000Z' }],
    })
    vi.stubGlobal('fetch', fetchMock)
    const { saveRemoteState } = await import('./remoteStore')

    await saveRemoteState(emptyState, { accessToken:'token-a', userId:'user-a' })
    await saveRemoteState(emptyState, { accessToken:'token-b', userId:'user-b' })

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://supabase.test/rest/v1/fleet_state?on_conflict=user_id', expect.objectContaining({
      body: expect.stringContaining('"user_id":"user-a"'),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://supabase.test/rest/v1/fleet_state?on_conflict=user_id', expect.objectContaining({
      body: expect.stringContaining('"user_id":"user-b"'),
    }))
  })

  it('mantiene la sesión remota en localStorage solo como credencial de acceso', async () => {
    const { readRemoteSession, saveRemoteSession } = await import('./remoteStore')

    saveRemoteSession({ accessToken: 'token-1', email: 'hola@monkey.test', userId:'user-a' })

    expect(readRemoteSession()?.email).toBe('hola@monkey.test')
    saveRemoteSession(null)
    expect(readRemoteSession()).toBeNull()
  })

  it('guarda sesiones temporales en sessionStorage y no persiste contraseñas', async () => {
    const { REMOTE_SESSION_KEY, readRemoteSession, saveRemoteSession, setRememberRemoteSession } = await import('./remoteStore')

    setRememberRemoteSession(false)
    saveRemoteSession({ accessToken: 'token-1', refreshToken: 'refresh-1', email: 'hola@monkey.test', userId:'user-a' }, false)

    expect(readRemoteSession()?.accessToken).toBe('token-1')
    expect(localStorage.getItem(REMOTE_SESSION_KEY)).toBeNull()
    expect(sessionStorage.getItem(REMOTE_SESSION_KEY)).toContain('token-1')
    expect(sessionStorage.getItem(REMOTE_SESSION_KEY)).not.toContain('secret')
  })

  it('al desactivar recordar sesión elimina la sesión persistente local', async () => {
    const { REMOTE_SESSION_KEY, getRememberRemoteSession, readRemoteSession, saveRemoteSession, setRememberRemoteSession } = await import('./remoteStore')

    saveRemoteSession({ accessToken: 'token-1', email: 'hola@monkey.test', userId:'user-a' }, true)
    setRememberRemoteSession(false)

    expect(getRememberRemoteSession()).toBe(false)
    expect(localStorage.getItem(REMOTE_SESSION_KEY)).toBeNull()
    expect(readRemoteSession()).toBeNull()
  })

  it('cierra sesión globalmente con Supabase Auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const { signOutRemote } = await import('./remoteStore')

    await signOutRemote({ accessToken: 'token-1', refreshToken: 'refresh-1' }, 'global')

    expect(fetchMock).toHaveBeenCalledWith('https://supabase.test/auth/v1/logout?scope=global', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
    }))
  })

  it('elimina la sesión local cuando Supabase rechaza el refresh token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    vi.stubGlobal('fetch', fetchMock)
    const { readRemoteSession, refreshRemoteSession, saveRemoteSession } = await import('./remoteStore')
    saveRemoteSession({ accessToken: 'token-1', refreshToken: 'refresh-revoked', email: 'hola@monkey.test', userId:'user-a' })

    const session = await refreshRemoteSession({ accessToken: 'token-1', refreshToken: 'refresh-revoked', email: 'hola@monkey.test' })

    expect(session).toBeNull()
    expect(readRemoteSession()).toBeNull()
  })

  it('refresca el token caducado y reintenta la lectura', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'token-2', refresh_token: 'refresh-2', user: { id:'user-a', email: 'hola@monkey.test' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ state: emptyState, updated_at: '2026-06-15T10:00:00.000Z' }],
      })
    vi.stubGlobal('fetch', fetchMock)
    const { fetchRemoteState, readRemoteSession, saveRemoteSession } = await import('./remoteStore')
    saveRemoteSession({ accessToken: 'token-1', refreshToken: 'refresh-1', email: 'hola@monkey.test', userId:'user-a' })

    const row = await fetchRemoteState({ accessToken: 'token-1', refreshToken: 'refresh-1', userId:'user-a' })

    expect(row?.updated_at).toBe('2026-06-15T10:00:00.000Z')
    expect(readRemoteSession()?.accessToken).toBe('token-2')
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://supabase.test/auth/v1/token?grant_type=refresh_token', expect.objectContaining({
      body: JSON.stringify({ refresh_token: 'refresh-1' }),
    }))
  })

  it('conserva el usuario propietario al refrescar una sesión sin objeto user', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token:'token-2', refresh_token:'refresh-2' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { refreshRemoteSession } = await import('./remoteStore')

    const session = await refreshRemoteSession({ accessToken:'token-1', refreshToken:'refresh-1', userId:'user-a', email:'hola@monkey.test' })

    expect(session).toMatchObject({ accessToken:'token-2', refreshToken:'refresh-2', userId:'user-a', email:'hola@monkey.test' })
  })
})
