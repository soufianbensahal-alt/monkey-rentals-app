import { authenticatedUser, allowedEndpoint, db, env, rpc, loadNotificationConfig } from '../_shared/server.ts'
export const handleDevice=async (request:Request)=>{
  await loadNotificationConfig()
  const origin=request.headers.get('Origin')||''
  const permitted=origin===env('APP_ORIGIN')
  const headers={'Access-Control-Allow-Origin':permitted?origin:env('APP_ORIGIN'),'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}
  const response=(value:unknown,status=200)=>Response.json(value,{status,headers})
  if(!permitted)return response({error:'Forbidden origin'},403)
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(request.method!=='POST')return response({error:'Method not allowed'},405)
  try {
    const user=await authenticatedUser(request)
    const raw=await request.text()
    if(raw.length>12000)return response({error:'Request too large'},413)
    const body=JSON.parse(raw)
    if(body.action==='config') {
      const runtime=await db('notification_runtime?id=eq.1&select=last_success')
      if(!runtime[0]?.last_success || Date.now()-Date.parse(runtime[0].last_success)>5*60000)return response({error:'Scheduler not ready'},503)
      return response({publicKey:env('VAPID_PUBLIC_KEY')})
    }
    if(body.action==='subscribe') {
      const sub=body.subscription
      if(!sub||!allowedEndpoint(sub.endpoint)||!sub.keys||!/^[A-Za-z0-9_-]{87}$/.test(sub.keys.p256dh)||!/^[A-Za-z0-9_-]{22}$/.test(sub.keys.auth))return response({error:'Invalid subscription'},400)
      await rpc('notification_register_device',{owner:user.id,session:user.sessionId,p_endpoint:sub.endpoint,p_keys:sub.keys})
      return response({active:true})
    }
    if(!allowedEndpoint(body.endpoint))return response({error:'Invalid endpoint'},400)
    const filter=`user_id=eq.${encodeURIComponent(user.id)}&endpoint=eq.${encodeURIComponent(body.endpoint)}`
    if(body.action==='unsubscribe') {await db(`notification_subscriptions?${filter}`,{method:'DELETE'});return response({active:false})}
    if(body.action==='status') {const rows=await db(`notification_subscriptions?${filter}&session_id=eq.${user.sessionId}&select=id`);return response({active:rows.length>0})}
    return response({error:'Invalid action'},400)
  }catch(error){console.error('notification-device',error instanceof Error?error.message:'error');return response({error:'Notification service unavailable'},error instanceof Error&&error.message==='Unauthorized'?401:503)}
}
