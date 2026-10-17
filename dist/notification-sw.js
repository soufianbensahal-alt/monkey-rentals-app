/* Push notifications were removed. Devices that installed the old worker update to this
   one, drop their push subscription and unregister it. Do not delete this file. */
self.addEventListener('install',()=>self.skipWaiting())
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  try {await (await self.registration.pushManager.getSubscription())?.unsubscribe()} catch { /* Already gone. */ }
  for(const notification of await self.registration.getNotifications())notification.close()
  indexedDB.deleteDatabase('monkey-notification-device')
  await self.registration.unregister()
})()))
