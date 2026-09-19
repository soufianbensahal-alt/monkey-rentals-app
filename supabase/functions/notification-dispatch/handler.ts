import webpush from '../_shared/webpush.ts'
import { Temporal } from '@js-temporal/polyfill'
import { db, env, configured, rpc, allowedEndpoint, loadNotificationConfig } from '../_shared/server.ts'
import { occurrences, dateInZone, validateReminder } from '../_shared/reminders.ts'
import type { CalendarEvent, FleetState } from '../_shared/types.ts'
interface Subscription {id:string;user_id:string;session_id:string;endpoint:string;keys:{p256dh:string;auth:string}}
async function digest(value:string) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('')}
export const handleDispatch=async (request:Request)=>{
  if(request.method!=='POST')return new Response('Method not allowed',{status:405})
  // Private Cron token: never the browser's anon key, and never included in the client bundle.
  const given=request.headers.get('x-cron-secret')||''
  if(!given)return new Response('Unauthorized',{status:401})
  await loadNotificationConfig()
  if(await digest(given)!==await digest(env('NOTIFICATION_CRON_SECRET')))return new Response('Unauthorized',{status:401})
  if(!configured('VAPID_PRIVATE_KEY')) {
    const pair=await webpush.generateVAPIDKeys()
    await rpc('notification_initialize_vapid',{public_key:pair.publicKey,private_key:pair.privateKey})
    await loadNotificationConfig()
  }
  const now=new Date(), cutoff=new Date(now.getTime()-24*3600000)
  let claimed=0,sent=0,failed=0
  try {
    // Pagination prevents silently ignoring devices after the PostgREST row limit.
    for(let page=0;page<100;page++) {
      const devices:Subscription[]=await db(`notification_subscriptions?select=*&order=id&limit=100&offset=${page*100}`)
      for(const device of devices) {
        if(!allowedEndpoint(device.endpoint))continue
        if(!await rpc('notification_session_active',{owner:device.user_id,session:device.session_id}))continue
        const rows=await db(`fleet_state?user_id=eq.${device.user_id}&select=state&limit=1`)
        const state=rows[0]?.state as FleetState|undefined
        const prefs=state?.adminSettings?.notifications
        if(!state||!prefs?.enabled||!Array.isArray(prefs.categories)||!Array.isArray(state.events))continue
        for(const event of state.events.slice(0,5000)) {
          if(!event||!event.revision||!event.updatedAt||!prefs.categories.includes(event.type)||validateReminder(event))continue
          const from=dateInZone(cutoff,event.timezone)
          // Max supported offset is 365 days, including a separate notification clock.
          const to=Temporal.PlainDate.from(dateInZone(now,event.timezone)).add({days:367}).toString()
          for(const occurrence of occurrences(event,from,to)) {
            for(const notice of occurrence.notifications) {
              const timestamp=Date.parse(notice.at)
              if(timestamp>now.getTime()||timestamp<cutoff.getTime()||timestamp<Date.parse(event.updatedAt))continue
              const deliveryKey=await digest(`${device.id}:${event.id}:${event.revision}:${occurrence.date}:${notice.index}`)
              // Atomic unique claim rechecks ownership, session, preferences and current event revision.
              const accepted=await rpc('notification_claim',{p_device:device.id,p_event:event.id,p_revision:event.revision,p_key:deliveryKey,p_scheduled:notice.at})
              if(!accepted)continue
              claimed++
              // Read back the event after claim so edits/deletions invalidate pending work.
              const freshRows=await db(`fleet_state?user_id=eq.${device.user_id}&select=state&limit=1`)
              const fresh=freshRows[0]?.state as FleetState|undefined
              const latest=fresh?.events.find((e:CalendarEvent)=>e.id===event.id)
              const freshPrefs=fresh?.adminSettings?.notifications
              if(!latest||latest.revision!==event.revision||latest.status==='completed'||latest.status==='cancelled'||!freshPrefs?.enabled||!freshPrefs.categories.includes(event.type)) {
                await db(`notification_deliveries?delivery_key=eq.${deliveryKey}`,{method:'PATCH',body:JSON.stringify({status:'cancelled'})});continue
              }
              try {
                await webpush.sendNotification({endpoint:device.endpoint,keys:device.keys},JSON.stringify({ownerId:device.user_id,tag:deliveryKey,body:`${event.title} · ${occurrence.date.split('-').reverse().join('/')} a las ${occurrence.time} (${event.timezone})`,url:`/app/calendario?reminder=${encodeURIComponent(event.id)}&date=${occurrence.date}`}),{vapidDetails:{subject:env('VAPID_SUBJECT'),publicKey:env('VAPID_PUBLIC_KEY'),privateKey:env('VAPID_PRIVATE_KEY')},TTL:3600,timeout:10000})
                sent++
                await db(`notification_deliveries?delivery_key=eq.${deliveryKey}`,{method:'PATCH',body:JSON.stringify({status:'sent',notification_sent:true,notification_sent_at:new Date().toISOString()})})
              }catch(error) {
                failed++
                const code=(error as {statusCode?:number;response?:Response}).statusCode || (error as {response?:Response}).response?.status
                // Never retry an ambiguous send: delivery may already have occurred. Surface failures for review.
                await db(`notification_deliveries?delivery_key=eq.${deliveryKey}`,{method:'PATCH',body:JSON.stringify({status:'failed',error_code:String(code||'network_or_unknown')})})
                if(code===404||code===410)await db(`notification_subscriptions?id=eq.${device.id}`,{method:'DELETE'})
              }
            }
          }
        }
      }
      if(devices.length<100)break
    }
    await db('notification_runtime?id=eq.1',{method:'PATCH',body:JSON.stringify({last_success:new Date().toISOString()})})
    return Response.json({claimed,sent,failed})
  }catch(error){console.error('notification-dispatch',error instanceof Error?error.message:'error');return Response.json({error:'Dispatch failed',claimed,sent,failed},{status:503})}
}
