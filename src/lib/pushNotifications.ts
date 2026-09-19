import { callNotificationService } from './remoteStore'
export function supportsPush() { return typeof window!=='undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext }
async function registration() {await navigator.serviceWorker.register('/notification-sw.js',{scope:'/'});return navigator.serviceWorker.ready}
async function bindOwner(reg:ServiceWorkerRegistration,owner:string|null) {
  const worker=reg.active
  if(!worker)throw new Error('El servicio de notificaciones todavía no está listo.')
  await new Promise<void>((resolve,reject)=>{
    const channel=new MessageChannel()
    const timer=setTimeout(()=>reject(new Error('No se ha podido preparar el dispositivo.')),5000)
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();if(event.data?.ok)resolve();else reject(new Error('No se ha podido guardar el permiso local.'))}
    worker.postMessage({type:'notification-owner',owner},[channel.port2])
  })
}
export async function enableDevice(owner:string) {
  if(!supportsPush())throw new Error('Este navegador no permite Web Push. En iPhone, añade Monkey Rentals a la pantalla de inicio y ábrela desde allí.')
  // Must be requested directly from the user's click, before a network await (iOS).
  const permission=await Notification.requestPermission()
  if(permission!=='granted')throw new Error('Permiso no concedido. Los avisos seguirán disponibles en Calendario y Alertas.')
  const info=await callNotificationService({action:'config'})
  if(!info.publicKey)throw new Error('Falta configurar el envío de notificaciones en el servidor.')
  const reg=await registration()
  const raw=atob(info.publicKey.replace(/-/g,'+').replace(/_/g,'/'))
  const key=Uint8Array.from(raw,c=>c.charCodeAt(0))
  let subscription=await reg.pushManager.getSubscription()
  if(subscription) {
    await callNotificationService({action:'unsubscribe',endpoint:subscription.endpoint})
    await subscription.unsubscribe()
  }
  subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key})
  try {
    await callNotificationService({action:'subscribe',subscription:subscription.toJSON()})
    await bindOwner(reg,owner)
  } catch(error) {await subscription.unsubscribe();throw error}
}
export async function disableDevice() {
  if(!('serviceWorker' in navigator))return
  const reg=await navigator.serviceWorker.getRegistration('/')
  if(!reg)return
  await bindOwner(reg,null)
  const subscription=await reg.pushManager.getSubscription()
  if(subscription) {
    try {await callNotificationService({action:'unsubscribe',endpoint:subscription.endpoint})}
    finally {await subscription.unsubscribe()}
  }
  for(const notification of await reg.getNotifications())notification.close()
}
export async function clearDeviceOnLogout() {
  if(!('serviceWorker' in navigator))return
  const reg=await navigator.serviceWorker.getRegistration('/')
  if(!reg)return
  await bindOwner(reg,null)
  for(const notification of await reg.getNotifications())notification.close()
  await (await reg.pushManager.getSubscription())?.unsubscribe()
}
export async function deviceIsActive() {
  if(!supportsPush() || Notification.permission!=='granted')return false
  const reg=await navigator.serviceWorker.getRegistration('/')
  const sub=await reg?.pushManager.getSubscription()
  if(!sub)return false
  return Boolean((await callNotificationService({action:'status',endpoint:sub.endpoint})).active)
}
