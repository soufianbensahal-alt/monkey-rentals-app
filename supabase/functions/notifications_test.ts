import webpush from './_shared/webpush.ts'
import { handleDispatch } from './notification-dispatch/handler.ts'
import { handleDevice } from './notification-device/handler.ts'
const assert=(value:unknown,message='assertion failed')=>{if(!value)throw new Error(message)}
const owner='11111111-1111-4111-8111-111111111111'
const other='22222222-2222-4222-8222-222222222222'
function config() {
  for(const [key,value] of Object.entries({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service',SUPABASE_ANON_KEY:'test-anon',APP_ORIGIN:'https://monkey.example',NOTIFICATION_CRON_SECRET:'test-cron-secret',VAPID_PUBLIC_KEY:'test-public',VAPID_PRIVATE_KEY:'test-private',VAPID_SUBJECT:'https://monkey.example'}))Deno.env.set(key,value)
}
Deno.test('private dispatcher refuses invalid credentials before reading any data',async()=>{
  config();const original=globalThis.fetch;let calls=0
  globalThis.fetch=()=>{calls++;throw new Error('Unexpected fetch')}
  try {const result=await handleDispatch(new Request('https://test/dispatch',{method:'POST'}));assert(result.status===401);assert(calls===0)}finally{globalThis.fetch=original}
})
Deno.test('dispatcher sends once, respects cancellation and never crosses account ownership',async()=>{
  config();const originalFetch=globalThis.fetch,originalSend=webpush.sendNotification
  const now=new Date(),day=now.toISOString().slice(0,10),time=now.toISOString().slice(11,16)
  const event={id:'e1',revision:'r1',title:'Llamar al gestor',date:day,time,timezone:'UTC',type:'otro',status:'active',updatedAt:new Date(now.getTime()-86400000).toISOString(),reminders:[{value:0,unit:'minutes'}]}
  const device={id:'d1',user_id:owner,session_id:'s1',endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'test',auth:'test'}}
  const state={events:[event],adminSettings:{notifications:{enabled:true,categories:['otro']}}}
  const claims=new Set<string>(),payloads:Record<string,unknown>[]=[],statuses:string[]=[]
  let cancelled=false,reads=0
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)),body=init?.body?JSON.parse(String(init.body)):null
    let data:unknown=[]
    if(url.pathname.endsWith('/notification_subscriptions'))data=[device]
    else if(url.pathname.endsWith('/notification_session_active')){assert(body.owner===owner);data=true}
    else if(url.pathname.endsWith('/fleet_state')){assert(url.searchParams.get('user_id')===`eq.${owner}`);reads++;data=[{state:cancelled&&reads%2===0?{...state,events:[]}:state}]}
    else if(url.pathname.endsWith('/notification_claim')){assert(body.p_device==='d1');data=!claims.has(body.p_key);claims.add(body.p_key)}
    else if(url.pathname.endsWith('/notification_deliveries'))statuses.push(body.status)
    return Response.json(data)
  }
  webpush.sendNotification=async(_sub:unknown,payload:unknown)=>{payloads.push(JSON.parse(String(payload)));return {statusCode:201,body:'',headers:{}}}
  const invoke=()=>handleDispatch(new Request('https://test/dispatch',{method:'POST',headers:{'x-cron-secret':'test-cron-secret'}}))
  try {
    assert((await invoke()).status===200);assert((await invoke()).status===200)
    assert(payloads.length===1,'duplicate send');assert(payloads[0].ownerId===owner);assert(statuses.includes('sent'))
    claims.clear();reads=0;cancelled=true
    await invoke();assert(payloads.length===1,'deleted event sent');assert(statuses.includes('cancelled'))
  }finally{globalThis.fetch=originalFetch;webpush.sendNotification=originalSend}
})
Deno.test('device enrollment uses verified user, rejects private endpoints, ignores spoofed owner',async()=>{
  config();const original=globalThis.fetch
  const claims=btoa(JSON.stringify({sub:owner,session_id:'session-a'}))
  let registered:Record<string,unknown>|null=null
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input)),body=init?.body?JSON.parse(String(init.body)):null
    if(url.pathname==='/auth/v1/user')return Response.json({id:owner})
    if(url.pathname.endsWith('/notification_session_active'))return Response.json(true)
    if(url.pathname.endsWith('/notification_register_device'))registered=body
    return Response.json(null)
  }
  const request=(endpoint:string)=>new Request('https://test/device',{method:'POST',headers:{Origin:'https://monkey.example',Authorization:`Bearer header.${claims}.signature`},body:JSON.stringify({action:'subscribe',user_id:other,subscription:{endpoint,keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}}})})
  try {
    assert((await handleDevice(request('https://127.0.0.1/internal'))).status===400)
    assert(registered===null)
    assert((await handleDevice(request('https://fcm.googleapis.com/fcm/send/token'))).status===200)
    assert((registered as unknown as {owner:string}).owner===owner)
  }finally{globalThis.fetch=original}
})
Deno.test('WebCrypto generates VAPID keys and encrypts a push without Node crypto',async()=>{
  const original=globalThis.fetch
  const pair=await webpush.generateVAPIDKeys()
  const client=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits'])
  const raw=new Uint8Array(await crypto.subtle.exportKey('raw',client.publicKey))
  const encode=(v:Uint8Array)=>btoa(String.fromCharCode(...v)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
  let sent=false
  globalThis.fetch=async(_input,init)=>{
    const headers=new Headers(init?.headers)
    assert(headers.get('Authorization')?.startsWith('vapid '),'missing VAPID authorization')
    assert(headers.get('Content-Encoding')==='aes128gcm','missing encryption')
    sent=true;return new Response(null,{status:201})
  }
  try {
    await webpush.sendNotification({endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:encode(raw),auth:encode(crypto.getRandomValues(new Uint8Array(16)))}},JSON.stringify({body:'Test local'}),{vapidDetails:{subject:'https://monkey.example',...pair},TTL:3600,timeout:10000})
    assert(sent)
  }finally{globalThis.fetch=original}
})
