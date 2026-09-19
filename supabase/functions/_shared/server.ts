const serverConfig:Record<string,string>={}
export const configured=(name:string)=>serverConfig[name] || Deno.env.get(name)
export const env=(name:string)=>{const value=configured(name);if(!value)throw new Error(`Missing server configuration: ${name}`);return value}
export async function db(path:string,init:RequestInit={}) {
  const key=env('SUPABASE_SERVICE_ROLE_KEY')
  const response=await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`,{...init,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation',...init.headers},signal:AbortSignal.timeout(10000)})
  if(!response.ok)throw new Error(`Database request failed (${response.status})`)
  const text=await response.text();return text?JSON.parse(text):null
}
export const rpc=(name:string,body:Record<string,unknown>)=>db(`rpc/${name}`,{method:'POST',body:JSON.stringify(body)})
export async function authenticatedUser(request:Request) {
  const authorization=request.headers.get('Authorization')||''
  if(!authorization.startsWith('Bearer '))throw new Error('Unauthorized')
  const result=await fetch(`${env('SUPABASE_URL')}/auth/v1/user`,{headers:{apikey:env('SUPABASE_ANON_KEY'),Authorization:authorization},signal:AbortSignal.timeout(10000)})
  if(!result.ok)throw new Error('Unauthorized')
  const user=await result.json()
  // Claims are read only after the token has been verified by Supabase Auth.
  const encoded=authorization.slice(7).split('.')[1].replace(/-/g,'+').replace(/_/g,'/')
  const claims=JSON.parse(atob(encoded.padEnd(encoded.length+(4-encoded.length%4)%4,'=')))
  if(claims.sub!==user.id || !claims.session_id || !await rpc('notification_session_active',{owner:user.id,session:claims.session_id}))throw new Error('Unauthorized')
  return {id:user.id as string,sessionId:claims.session_id as string}
}
export function allowedEndpoint(endpoint:unknown):endpoint is string {
  if(typeof endpoint!=='string'||endpoint.length>4096)return false
  try {
    const url=new URL(endpoint)
    return url.protocol==='https:' && !url.username && !url.password && (!url.port||url.port==='443') && (url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname.endsWith('.push.services.mozilla.com')||url.hostname==='web.push.apple.com'||url.hostname.endsWith('.notify.windows.com'))
  }catch{return false}
}

export async function loadNotificationConfig() {
  const settings=await rpc('notification_server_config',{})
  for(const [key,value] of Object.entries(settings || {})) if(typeof value==='string')serverConfig[key]=value
}
