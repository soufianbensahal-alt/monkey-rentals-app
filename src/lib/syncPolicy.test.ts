import { describe, expect, it } from 'vitest'
import { REMOTE_ACTIVE_WINDOW_MS, REMOTE_REFRESH_INTERVAL_MS, shouldPollRemote } from './syncPolicy'

describe('política de sincronización remota',()=>{
  it('no consulta Supabase durante cinco minutos sin interacción',()=>{
    const startedAt=Date.parse('2026-10-03T10:00:00Z')
    const polls=Array.from({length:300_000/REMOTE_REFRESH_INTERVAL_MS},(_,index)=>startedAt+(index+1)*REMOTE_REFRESH_INTERVAL_MS)
    expect(polls.filter(now=>shouldPollRemote(now,startedAt,false))).toHaveLength(0)
  })

  it('permite comprobar cambios tras actividad reciente y nunca con la pestaña oculta',()=>{
    const now=100_000
    expect(shouldPollRemote(now,now-REMOTE_ACTIVE_WINDOW_MS,false)).toBe(true)
    expect(shouldPollRemote(now,now-REMOTE_ACTIVE_WINDOW_MS-1,false)).toBe(false)
    expect(shouldPollRemote(now,now,false)).toBe(true)
    expect(shouldPollRemote(now,now,true)).toBe(false)
  })
})
