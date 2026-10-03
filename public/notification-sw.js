/* Push only: does not cache authenticated API responses or business data. */
function ownerStore(mode, value, key='owner') {
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open('monkey-notification-device',1)
    open.onupgradeneeded=()=>open.result.createObjectStore('settings')
    open.onerror=()=>reject(open.error)
    open.onsuccess=()=>{
      const db=open.result, tx=db.transaction('settings',mode), store=tx.objectStore('settings')
      const request=mode==='readwrite'?store.put(value,key):store.get(key)
      tx.oncomplete=()=>{resolve(request.result);db.close()}
      tx.onerror=()=>{reject(tx.error);db.close()}
    }
  })
}
self.addEventListener('install',()=>self.skipWaiting())
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()))
self.addEventListener('message',event=>{
  if(event.data?.type==='notification-owner')event.waitUntil(ownerStore('readwrite',event.data.owner||null).then(()=>event.ports[0]?.postMessage({ok:true})).catch(()=>event.ports[0]?.postMessage({ok:false})))
})
let pushQueue=Promise.resolve()
self.addEventListener('push',event=>{
  pushQueue=pushQueue.catch(()=>{}).then(async()=>{
    if(!event.data)return
    const data=event.data.json(), owner=await ownerStore('readonly')
    if(!owner || owner!==data.ownerId)return
    const receiptKey=`receipts:${owner}`
    const receipts=(await ownerStore('readonly',undefined,receiptKey))||[]
    if(receipts.includes(String(data.tag)))return
    const url=typeof data.url==='string'&&data.url.startsWith('/app/calendario?')?data.url:'/app/alertas'
    await self.registration.showNotification('Monkey Rentals',{body:String(data.body||'Tienes un recordatorio pendiente.'),icon:'/monkey-icon-192.png',badge:'/monkey-icon-192.png',tag:String(data.tag),renotify:false,data:{url,ownerId:owner}})
    await ownerStore('readwrite',[...receipts.slice(-999),String(data.tag)],receiptKey)
  })
  event.waitUntil(pushQueue)
})
self.addEventListener('notificationclick',event=>{
  event.notification.close()
  event.waitUntil((async()=>{
    const owner=await ownerStore('readonly')
    if(!owner || owner!==event.notification.data?.ownerId)return
    const url=new URL(event.notification.data.url,self.location.origin)
    if(url.origin!==self.location.origin)return
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true})
    const target=windows.find(client=>new URL(client.url).origin===url.origin)
    if(target){await target.navigate(url.href);await target.focus()}else await self.clients.openWindow(url.href)
  })())
})
