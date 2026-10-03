import { getRemoteOwnerId, privateStorage, privateTable, readRemoteSession } from './remoteStore'
import { cachedSignedUrl, invalidateSignedUrls } from './signedUrls'
import type { Vehicle } from '../types'

const bucket='vehicle-images'

async function encode(file:Blob,maxDimension:number,quality:number) {
  const bitmap=await createImageBitmap(file)
  const scale=Math.min(1,maxDimension/Math.max(bitmap.width,bitmap.height))
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
  canvas.getContext('2d')?.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close()
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('No se ha podido optimizar la imagen.')),'image/webp',quality))
}

export async function uploadVehicleImage(file:Blob,vehicleId:string) {
  const owner=getRemoteOwnerId(readRemoteSession());if(!owner)throw new Error('Inicia sesión para guardar la fotografía del vehículo.')
  const [full,thumbnail]=await Promise.all([encode(file,1600,.78),encode(file,360,.72)])
  const id=crypto.randomUUID(),base=`${owner}/${encodeURIComponent(vehicleId)}`
  const path=`${base}/${id}.webp`,thumbnailPath=`${base}/${id}-thumb.webp`
  await privateStorage(`object/${bucket}/${path}`,{method:'POST',body:full})
  try {
    await privateStorage(`object/${bucket}/${thumbnailPath}`,{method:'POST',body:thumbnail})
    await privateTable('vehicle_images','?on_conflict=id',{method:'POST',body:JSON.stringify([{id,user_id:owner,vehicle_id:vehicleId,storage_path:path,thumbnail_path:thumbnailPath,mime_type:'image/webp',file_size:full.size}])})
    return {image:'',imagePath:path,imageThumbnailPath:thumbnailPath}
  }catch(error){await privateStorage(`object/${bucket}`,{method:'DELETE',body:JSON.stringify({prefixes:[path,thumbnailPath]})}).catch(()=>{});throw error}
}

export async function vehicleImageUrl(vehicle:Pick<Vehicle,'image'|'imagePath'|'imageThumbnailPath'>,thumbnail=true) {
  if(vehicle.image)return vehicle.image
  const path=thumbnail?(vehicle.imageThumbnailPath||vehicle.imagePath):vehicle.imagePath
  return path?cachedSignedUrl(bucket,path):''
}

export async function deleteVehicleImages(vehicle:Pick<Vehicle,'imagePath'|'imageThumbnailPath'>) {
  const paths=[vehicle.imagePath,vehicle.imageThumbnailPath].filter((path):path is string=>Boolean(path))
  if(!paths.length)return
  await privateStorage(`object/${bucket}`,{method:'DELETE',body:JSON.stringify({prefixes:paths})})
  invalidateSignedUrls(bucket,paths)
  if(vehicle.imagePath)await privateTable('vehicle_images',`?storage_path=eq.${encodeURIComponent(vehicle.imagePath)}`,{method:'DELETE'})
}
