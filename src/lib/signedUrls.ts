import { privateStorage, storageSignedUrl } from './remoteStore'

const TTL_SECONDS=3600
const CACHE_MS=55*60*1000
const cache=new Map<string,{url:string;expires:number}>()

export async function cachedSignedUrl(bucket:string,path:string,download?:string) {
  const key=`${bucket}:${path}:${download||''}`
  const cached=cache.get(key)
  if(cached&&cached.expires>Date.now())return cached.url
  const response=await privateStorage(`object/sign/${bucket}/${path}`,{method:'POST',body:JSON.stringify({expiresIn:TTL_SECONDS,download:download||undefined})})
  const data=await response.json() as {signedURL:string}
  const url=storageSignedUrl(data.signedURL)
  cache.set(key,{url,expires:Date.now()+CACHE_MS})
  return url
}

export function invalidateSignedUrls(bucket:string,paths:string[]) {
  for(const key of cache.keys())if(paths.some(path=>key.startsWith(`${bucket}:${path}:`)))cache.delete(key)
}
