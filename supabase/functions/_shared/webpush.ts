import { ApplicationServer, generateVapidKeys, exportVapidKeys, importVapidKeys } from '@negrel/webpush'
const webpush={
  async generateVAPIDKeys() {
    const keys=await generateVapidKeys({extractable:true})
    const raw=new Uint8Array(await crypto.subtle.exportKey('raw',keys.publicKey))
    const publicKey=btoa(String.fromCharCode(...raw)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
    return {publicKey,privateKey:JSON.stringify(await exportVapidKeys(keys))}
  },
  async sendNotification(subscription:{endpoint:string;keys:{p256dh:string;auth:string}},payload:string,options:{vapidDetails:{subject:string;publicKey:string;privateKey:string};TTL:number;timeout:number}) {
    const app=await ApplicationServer.new({contactInformation:options.vapidDetails.subject,vapidKeys:await importVapidKeys(JSON.parse(options.vapidDetails.privateKey))})
    await app.subscribe(subscription).pushTextMessage(payload,{ttl:options.TTL})
    return {statusCode:201,body:'',headers:{}}
  }
}
export default webpush
