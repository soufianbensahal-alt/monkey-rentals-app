import webpush from '../_shared/webpush.ts'
import { Temporal } from '@js-temporal/polyfill'
import { db, env, configured, rpc, allowedEndpoint, loadNotificationConfig } from '../_shared/server.ts'
import { occurrences, dateInZone, validateReminder } from '../_shared/reminders.ts'
import type { CalendarEvent } from '../_shared/types.ts'
interface Subscription {created_at?:string;id:string;user_id:string;session_id:string;endpoint:string;keys:{p256dh:string;auth:string}}
interface NotificationProjection {events?:CalendarEvent[];notifications?:{enabled?:boolean;categories?:string[]}}
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
    const projections=new Map<string,Promise<NotificationProjection|undefined>>()
    const projection=(userId:string,fresh=false)=>{
      if(fresh)projections.delete(userId)
      let pending=projections.get(userId)
      if(!pending){
        pending=db(`fleet_state?user_id=eq.${userId}&select=events:state->events,notifications:state->adminSettings->notifications&limit=1`).then(rows=>rows[0] as NotificationProjection|undefined)
        projections.set(userId,pending)
      }
      return pending
    }
    // Pagination prevents silently ignoring devices after the PostgREST row limit.
    for(let page=0;page<100;page++) {
      const devices:Subscription[]=await db(`notification_subscriptions?active=eq.true&select=id,user_id,session_id,endpoint,keys,created_at&order=id&limit=100&offset=${page*100}`)
      for(const device of devices) {
        if(!allowedEndpoint(device.endpoint))continue
        if(!await rpc('notification_session_active',{owner:device.user_id,session:device.session_id}))continue
        const state=await projection(device.user_id)
        const prefs=state?.notifications
        if(!prefs?.enabled||!Array.isArray(prefs.categories)||!Array.isArray(state?.events))continue
        for(const event of state.events.slice(0,5000)) {
          if(!event||!event.revision||!event.updatedAt||!prefs.categories.includes(event.type)||validateReminder(event))continue
          const from=dateInZone(cutoff,event.timezone)
          // Max supported offset is 365 days, including a separate notification clock.
          const to=Temporal.PlainDate.from(dateInZone(now,event.timezone)).add({days:367}).toString()
          for(const occurrence of occurrences(event,from,to)) {
            for(const notice of occurrence.notifications) {
              const timestamp=Date.parse(notice.at)
              if(timestamp>now.getTime()+30*86400000||timestamp<cutoff.getTime()||timestamp<Date.parse(event.updatedAt)||timestamp<Date.parse(device.created_at||'1970-01-01'))continue
              const deliveryKey=await digest(`${device.id}:${event.id}:${event.revision}:${occurrence.date}:${notice.index}`)
              if(timestamp>now.getTime()){await rpc('notification_schedule',{p_device:device.id,p_event:event.id,p_revision:event.revision,p_key:deliveryKey,p_scheduled:notice.at});continue}
              // Atomic unique claim rechecks ownership, session, preferences and current event revision.
              const accepted=await rpc('notification_claim',{p_device:device.id,p_event:event.id,p_revision:event.revision,p_key:deliveryKey,p_scheduled:notice.at})
              if(!accepted)continue
              claimed++
              // Read back the event after claim so edits/deletions invalidate pending work.
              const fresh=await projection(device.user_id,true)
              const latest=fresh?.events?.find((e:CalendarEvent)=>e.id===event.id)
              const freshPrefs=fresh?.notifications
              if(!latest||latest.revision!==event.revision||latest.status==='completed'||latest.status==='cancelled'||!freshPrefs?.enabled||!freshPrefs.categories.includes(event.type)) {
                await db(`notification_deliveries?delivery_key=eq.${deliveryKey}`,{method:'PATCH',body:JSON.stringify({status:'cancelled'})});continue
              }
              try {
                await webpush.sendNotification({endpoint:device.endpoint,keys:device.keys},JSON.stringify({ownerId:device.user_id,tag:deliveryKey,body:`${event.title} · ${occurrence.date.split('-').reverse().join('/')} a las ${occurrence.time} (${event.timezone})`,url:`/app/calendario?reminder=${encodeURIComponent(event.id)}&date=${occurrence.date}`}),{vapidDetails:{subject:env('VAPID_SUBJECT'),publicKey:env('VAPID_PUBLIC_KEY'),privateKey:env('VAPID_PRIVATE_KEY')},TTL:86400,timeout:10000})
                sent++
                await db(`notification_deliveries?delivery_key=eq.${deliveryKey}`,{method:'PATCH',body:JSON.stringify({status:'sent',notification_sent:true,notification_sent_at:new Date().toISOString()})})
              }catch(error) {
                failed++
                const code=(error as {statusCode?:number;response?:Response}).statusCode || (error as {response?:Response}).response?.status
                // Three atomic attempts maximum; stable tag and SW receipt journal suppress duplicates.
                await db(`notification_deliveries?delivery_key=eq.${deliveryKey}`,{method:'PATCH',body:JSON.stringify({status:'failed',error_code:String(code||'network_or_unknown'),next_attempt_at:!code||code===429||code>=500?new Date(Date.now()+120000).toISOString():null})})
                if(code===404||code===410)await db(`notification_subscriptions?id=eq.${device.id}`,{method:'PATCH',body:JSON.stringify({active:false,updated_at:new Date().toISOString()})})
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
