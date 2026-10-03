export const REMOTE_REFRESH_INTERVAL_MS=30_000
export const REMOTE_ACTIVE_WINDOW_MS=20_000

export function shouldPollRemote(now:number,lastActivityAt:number,hidden:boolean) {
  return !hidden && now-lastActivityAt<=REMOTE_ACTIVE_WINDOW_MS
}
