import { getRemoteOwnerId, readRemoteSession, privateStorage } from './remoteStore'
import { cachedSignedUrl, invalidateSignedUrls } from './signedUrls'
import type { MaterialPhoto } from '../types'
const bucket='maintenance-materials'
const maxBytes=1500000
async function encode(image:HTMLImageElement,width:number,quality:number):Promise<Blob> {
  const canvas=document.createElement('canvas'),scale=Math.min(1,width/Math.max(image.naturalWidth,image.naturalHeight))
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale))
  const context=canvas.getContext('2d');if(!context)throw new Error('No se puede comprimir esta imagen en el dispositivo.')
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height)
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality))
  if(blob?.type==='image/webp')return blob
  const jpeg=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality))
  if(!jpeg)throw new Error('No se ha podido convertir la imagen. Prueba con JPG o PNG.')
  return jpeg
}
export async function compressMaterialPhoto(file:File) {
  if(!file.type.startsWith('image/')||file.size>30*1024*1024)throw new Error('Selecciona una imagen de hasta 30 MB.')
  const url=URL.createObjectURL(file)
  try {
    const image=new Image();image.src=url;await image.decode()
    let full=await encode(image,1600,.78)
    if(full.size>800000)full=await encode(image,1600,.7)
    if(full.size>maxBytes)full=await encode(image,1200,.7)
    if(full.size>maxBytes)throw new Error('La imagen sigue superando 1,5 MB. Elige otra imagen.')
    return {full,thumbnail:await encode(image,400,.75)}
  }finally{URL.revokeObjectURL(url)}
}
export async function uploadMaterialPhoto(file:File,vehicleId:string,maintenanceId:string,materialId:string):Promise<MaterialPhoto> {
  const owner=getRemoteOwnerId(readRemoteSession());if(!owner)throw new Error('Inicia sesión para subir fotografías.')
  const {full,thumbnail}=await compressMaterialPhoto(file)
  if(getRemoteOwnerId(readRemoteSession())!==owner)throw new Error('La sesión ha cambiado. Vuelve a abrir el mantenimiento.')
  const id=crypto.randomUUID(),base=[owner,vehicleId,maintenanceId,materialId].map(encodeURIComponent).join('/'),ext=full.type==='image/webp'?'webp':'jpg'
  const path=`${base}/${id}.${ext}`,thumbnailPath=`${base}/${id}-thumb.${thumbnail.type==='image/webp'?'webp':'jpg'}`
  await privateStorage(`object/${bucket}/${path}`,{method:'POST',body:full})
  try {await privateStorage(`object/${bucket}/${thumbnailPath}`,{method:'POST',body:thumbnail})}catch(error){await privateStorage(`object/${bucket}`,{method:'DELETE',body:JSON.stringify({prefixes:[path]})}).catch(()=>{});throw error}
  return {id,path,thumbnailPath,size:full.size,mimeType:full.type}
}
export async function materialPhotoUrl(path:string) {
  const owner=getRemoteOwnerId(readRemoteSession())
  if(!owner||path.split('/')[0]!==owner)throw new Error('Esta fotografía no pertenece a la cuenta actual.')
  return cachedSignedUrl(bucket,path)
}
export async function discardStagedPhotos(photos:MaterialPhoto[]) {
  const owner=getRemoteOwnerId(readRemoteSession())
  const prefixes=photos.flatMap(p=>[p.path,p.thumbnailPath]).filter(path=>owner&&path.split('/')[0]===owner)
  if(prefixes.length){await privateStorage(`object/${bucket}`,{method:'DELETE',body:JSON.stringify({prefixes})});invalidateSignedUrls(bucket,prefixes)}
}
