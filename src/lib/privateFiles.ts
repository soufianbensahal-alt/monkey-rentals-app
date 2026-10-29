import { getRemoteOwnerId, privateStorage, privateTable, readRemoteSession } from './remoteStore'
import { uid } from './format'
import { cachedSignedUrl, invalidateSignedUrls } from './signedUrls'
import type { ClientDocument, ClientDocumentType, MaintenanceFile, PrivateFile, RentalDocument, RentalDocumentType } from '../types'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg','image/png','image/webp'])
const ALLOWED_TYPES = new Set([...IMAGE_TYPES,'application/pdf'])
type Target =
  | { type:'maintenance'; recordId:string; vehicleId:string }
  | { type:'rental'; recordId:string; vehicleId:string; customerId:string; documentType:RentalDocumentType }
  | { type:'client'; recordId:string; customerId:string; documentType:ClientDocumentType; notes:string }

type FileTarget=Target['type']|'expense'
const bucketFor=(target:FileTarget)=>target==='maintenance'?'maintenance-files':target==='rental'?'rental-documents':target==='expense'?'expense-receipts':'client-documents'
const tableFor=(target:Target['type']|'maintenance'|'rental'|'client')=>target==='maintenance'?'maintenance_files':target==='rental'?'rental_documents':'client_documents'

function ownerId() {
  const owner=getRemoteOwnerId(readRemoteSession())
  if(!owner)throw new Error('Inicia sesión para guardar archivos privados.')
  return owner
}

export function validatePrivateFile(file:File) {
  if(!ALLOWED_TYPES.has(file.type))throw new Error('Formato no admitido. Usa PDF, JPG, PNG o WebP.')
  if(file.size>MAX_FILE_SIZE)throw new Error('El archivo supera el límite de 10 MB.')
}

function safeName(name:string) { return name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-90) || 'archivo' }
async function imageBlob(file:File,max:number,quality:number) {
  const bitmap=await createImageBitmap(file)
  const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height))
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale)
  canvas.getContext('2d')?.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close()
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('No se ha podido procesar la imagen.')),'image/webp',quality))
}

// Uploads an optimized copy (plus thumbnail for images) to owner/recordId/ and returns its metadata.
export async function uploadPrivateObject(file:File,target:FileTarget,recordId:string,id=uid('file')):Promise<PrivateFile> {
  validatePrivateFile(file)
  const owner=ownerId(), image=IMAGE_TYPES.has(file.type), bucket=bucketFor(target)
  const extension=image?'webp':'pdf'
  const path=`${owner}/${recordId}/${id}-${safeName(file.name.replace(/\.[^.]+$/,''))}.${extension}`
  const thumbnailPath=image?`${owner}/${recordId}/${id}-thumb.webp`:undefined
  const body=image?await imageBlob(file,1600,.78):file
  if(body.size>MAX_FILE_SIZE)throw new Error('La imagen sigue superando 10 MB después de optimizarla.')
  await privateStorage(`object/${bucket}/${path}`,{method:'POST',body})
  try {
    if(thumbnailPath)await privateStorage(`object/${bucket}/${thumbnailPath}`,{method:'POST',body:await imageBlob(file,360,.72)})
  } catch(error) {
    await removePrivateObjects({path},target).catch(()=>{})
    throw error
  }
  return {id,fileName:file.name,path,thumbnailPath,size:body.size,mimeType:image?'image/webp':'application/pdf',kind:image?'image':'pdf',uploadedAt:new Date().toISOString()}
}

export async function removePrivateObjects(file:Pick<PrivateFile,'path'|'thumbnailPath'>,target:FileTarget) {
  const bucket=bucketFor(target), paths=[file.path,...(file.thumbnailPath?[file.thumbnailPath]:[])]
  await privateStorage(`object/${bucket}`,{method:'DELETE',body:JSON.stringify({prefixes:paths})})
  invalidateSignedUrls(bucket,paths)
}

export async function uploadPrivateFile(file:File,target:Target):Promise<MaintenanceFile|RentalDocument|ClientDocument> {
  const owner=ownerId(), id=target.type==='client'?target.recordId:uid('file')
  const common=await uploadPrivateObject(file,target.type,target.recordId,id)
  const {path,thumbnailPath}=common
  try {
    const row=target.type==='maintenance'
      ? {id,user_id:owner,maintenance_id:target.recordId,vehicle_id:target.vehicleId,file_name:common.fileName,storage_path:path,thumbnail_path:thumbnailPath||null,mime_type:common.mimeType,file_size:common.size,file_type:common.kind}
      : target.type==='rental'
        ? {id,user_id:owner,rental_id:target.recordId,vehicle_id:target.vehicleId,customer_id:target.customerId,document_type:target.documentType,file_name:common.fileName,storage_path:path,thumbnail_path:thumbnailPath||null,mime_type:common.mimeType,file_size:common.size}
        : {id,user_id:owner,customer_id:target.customerId,document_type:target.documentType,file_name:common.fileName,storage_path:path,thumbnail_path:thumbnailPath||null,mime_type:common.mimeType,file_size:common.size,file_type:common.kind,notes:target.notes}
    await privateTable(tableFor(target.type),'?on_conflict=id',{method:'POST',body:JSON.stringify([row])})
    if(target.type==='maintenance')return common
    if(target.type==='rental')return {...common,documentType:target.documentType}
    return {...common,customerId:target.customerId,type:target.documentType,dataUrl:'',notes:target.notes}
  } catch(error) {
    await removePrivateObjects(common,target.type).catch(()=>{})
    throw error
  }
}

export async function privateFileUrl(file:PrivateFile,target:FileTarget,download=false) {
  const bucket=bucketFor(target)
  return cachedSignedUrl(bucket,file.path,download?file.fileName:undefined)
}

export async function privateThumbnailUrl(file:PrivateFile,target:FileTarget) {
  if(!file.thumbnailPath)return ''
  return privateFileUrl({...file,path:file.thumbnailPath},target)
}

export async function deletePrivateFile(file:PrivateFile,target:'maintenance'|'rental'|'client') {
  await removePrivateObjects(file,target)
  await privateTable(tableFor(target),`?id=eq.${encodeURIComponent(file.id)}`,{method:'DELETE'})
}
