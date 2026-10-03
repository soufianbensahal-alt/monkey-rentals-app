import type { CellObject, Row, Sheet } from 'write-excel-file/browser'
import { buildReportWorkbook, reportFilters, type ReportSheet } from './reportWorkbook'
import { buildReport, economicMovements } from './reports'
import { createBackup } from './backups'
import { privateFileUrl } from './privateFiles'
import { materialPhotoUrl } from './materialPhotos'
import { vehicleImageUrl } from './vehicleImages'
import { vehicleLabel } from './vehicles'
import type { FleetState, PrivateFile } from '../types'

export type BackupProgress = { percent:number; label:string }
export type BackupProgressHandler = (progress:BackupProgress)=>void
const dateStamp=(now:Date)=>`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
export const administrativeBackupFilename=(now=new Date())=>`Monkey-Rentals-Backup-${dateStamp(now)}.zip`
const clean=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim().slice(0,100)||'Sin nombre'
const extension=(name:string,mime='')=>{const found=name.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1];if(found)return found.toLowerCase();if(mime==='application/pdf')return'pdf';if(mime.includes('png'))return'png';if(mime.includes('jpeg'))return'jpg';return'webp'}
const text=(value?:string):CellObject=>({type:String,value:value||'',wrap:true})
const header=(labels:string[]):Row=>labels.map(value=>({...text(value),fontWeight:'bold',backgroundColor:'#F97316',textColor:'#FFFFFF',height:32}))
const simpleSheet=(name:string,labels:string[],rows:Array<Array<string|number>>):Sheet<Blob>&{data:Row[]}=>({sheet:name,showGridLines:false,stickyRowsCount:1,columns:labels.map((label,index)=>({width:Math.min(45,Math.max(16,label.length+2,...rows.slice(0,200).map(row=>String(row[index]??'').length+2)))})),data:[header(labels),...(rows.length?rows.map(row=>row.map(value=>typeof value==='number'?{type:Number,value}:{...text(String(value)),height:30})): [[text('Sin registros')]])]})

async function workbookBlob(sheets:ReportSheet[]|Array<Sheet<Blob>&{data:Row[]}>) {
  const {default:writeXlsxFile}=await import('write-excel-file/browser')
  const typed=sheets as ReportSheet[]
  return writeXlsxFile(typed,{fontFamily:'Calibri',fontSize:11,features:'filterRange' in (typed[0]||{})?[reportFilters(typed)]:[]}).toBlob()
}
function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);try{link.click()}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}}

export async function createAdministrativeBackup(state:FleetState,ownerId:string|null,onProgress:BackupProgressHandler=()=>{},now=new Date()) {
  if(!ownerId)throw new Error('Inicia sesión para crear una copia administrativa.')
  const [{default:JSZip}]=await Promise.all([import('jszip')])
  const zip=new JSZip(),root=zip.folder(`Monkey Rentals Backup - ${dateStamp(now)}`)!
  const errors:string[]=[],seen=new Set<string>(),today=dateStamp(now)
  const reportSheets=buildReportWorkbook(state,today,state.adminSettings.name||state.adminSettings.email)
  const movements=economicMovements(state,today)
  const byName=(...names:string[])=>reportSheets.filter(sheet=>names.includes(String(sheet.sheet)))
  const addWorkbook=async(path:string,sheets:ReportSheet[]|Array<Sheet<Blob>&{data:Row[]}>)=>{try{root.file(path,await workbookBlob(sheets))}catch(error){errors.push(`${path}: ${error instanceof Error?error.message:'error al generar Excel'}`)}}
  const addBlob=async(path:string,key:string,loader:()=>Promise<Blob>)=>{if(seen.has(key))return;seen.add(key);try{root.file(path,await loader())}catch(error){errors.push(`${path}: ${error instanceof Error?error.message:'no se pudo descargar'}`)}}
  const fetchFile=async(url:string)=>{const response=await fetch(url);if(!response.ok)throw new Error(`descarga HTTP ${response.status}`);return response.blob()}
  const stored=async(file:PrivateFile,target:'maintenance'|'rental')=>fetchFile(await privateFileUrl(file,target,true))
  onProgress({percent:5,label:'Preparando clientes'})
  await addWorkbook('Clientes/clientes.xlsx',[simpleSheet('Clientes',['Nombre','Teléfono','Email','DNI / NIE / CIF','Dirección','Número de alquileres','Alquiler activo','Reservas futuras','Total pagado','Total pendiente','Total atrasado','Notas','Fecha de creación'],state.customers.map(customer=>{const rentals=state.rentals.filter(rental=>rental.customerId===customer.id),income=movements.filter(item=>item.kind==='ingreso'&&item.customerId===customer.id),extra=customer as typeof customer&{address?:string;notes?:string;createdAt?:string};return[customer.name,customer.phone,customer.email,customer.dni,extra.address||'',rentals.length,rentals.some(r=>r.status==='activo'&&r.startDate<=today&&(!r.endDate||r.endDate>=today))?'Sí':'No',rentals.filter(r=>['activo','pendiente'].includes(r.status)&&r.startDate>today).length,income.filter(item=>item.status==='pagado').reduce((sum,item)=>sum+item.amount,0),income.filter(item=>item.status==='pendiente').reduce((sum,item)=>sum+item.amount,0),income.filter(item=>item.status==='atrasado').reduce((sum,item)=>sum+item.amount,0),extra.notes||'',extra.createdAt||'']}))])
  for(const customer of state.customers){for(const doc of state.clientDocuments.filter(item=>item.customerId===customer.id)){const name=`Clientes/${clean(customer.name)}/${clean(doc.type)}-${clean(doc.fileName)}`;if(doc.path)await addBlob(name,`client:${doc.id}`,async()=>fetchFile(await privateFileUrl(doc as PrivateFile,'client',true)));else if(doc.dataUrl)await addBlob(name,`client:${doc.id}`,()=>fetchFile(doc.dataUrl));else errors.push(`${name}: el archivo original no está disponible en esta versión`)}}
  onProgress({percent:18,label:'Preparando flota'})
  await addWorkbook('Flota/flota.xlsx',[simpleSheet('Flota',['Matrícula','Marca','Modelo','Año','Tipo de vehículo','Kilometraje actual','Estado','Precio por día','Precio por semana','Precio por mes','Km incluidos','Precio por km extra','Ingresos generados','Gastos asociados','Último mantenimiento','Próxima ITV','Notas'],state.vehicles.map(vehicle=>{const vehicleMovements=movements.filter(item=>item.vehicleId===vehicle.id),lastMaintenance=state.maintenance.filter(item=>item.vehicleId===vehicle.id).sort((a,b)=>b.date.localeCompare(a.date))[0],nextItv=state.documents.filter(item=>item.vehicleId===vehicle.id&&/itv/i.test(item.type)&&item.expiryDate>=today).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate))[0];return[vehicle.plate,vehicle.brand,vehicle.model,vehicle.year,vehicle.category,vehicle.currentKm||0,vehicle.status,vehicle.dailyRate,vehicle.weeklyRate,vehicle.monthlyRate,vehicle.includedKmPerDay,vehicle.extraKmRate,vehicleMovements.filter(item=>item.kind==='ingreso'&&item.status==='pagado').reduce((sum,item)=>sum+item.amount,0),vehicleMovements.filter(item=>item.kind==='gasto'&&['pagado','registrado'].includes(item.status)).reduce((sum,item)=>sum+item.amount,0),lastMaintenance?.date||'',nextItv?.expiryDate||'',vehicle.notes]}))])
  for(const vehicle of state.vehicles){if(vehicle.image||vehicle.imagePath){const ext=vehicle.image?.startsWith('data:image/png')?'png':vehicle.image?.startsWith('data:image/jpeg')?'jpg':'webp';await addBlob(`Flota/Fotografías/${clean(vehicle.plate)}-1.${ext}`,`vehicle:${vehicle.id}`,async()=>fetchFile(vehicle.image||await vehicleImageUrl(vehicle,false)))}}
  onProgress({percent:30,label:'Preparando alquileres'})
  await addWorkbook('Alquileres/alquileres.xlsx',byName('Alquileres'))
  for(const rental of state.rentals)for(const doc of rental.documents||[]){const label={signed_contract:'contrato',delivery_document:'entrega',return_document:'devolucion',other:'documento'}[doc.documentType];await addBlob(`Alquileres/Contratos/alquiler-${clean(rental.id)}-${label}-${clean(doc.fileName)}`,`rental:${doc.path}`,()=>stored(doc,'rental'))}
  onProgress({percent:42,label:'Preparando pagos y deudas'})
  await addWorkbook('Pagos/pagos.xlsx',byName('Ingresos','Pagos pendientes','Pagos atrasados'))
  await addWorkbook('Pagos/deudas.xlsx',byName('Deudas','Pagos de deuda'))
  onProgress({percent:52,label:'Preparando mantenimientos'})
  await addWorkbook('Mantenimiento/mantenimientos.xlsx',byName('Mantenimiento'))
  await addWorkbook('Mantenimiento/materiales.xlsx',byName('Materiales y repuestos'))
  for(const maintenance of state.maintenance){const plate=state.vehicles.find(v=>v.id===maintenance.vehicleId)?.plate||maintenance.vehicleId;for(const file of maintenance.attachments||[])await addBlob(`Mantenimiento/Archivos/${clean(plate)}/${clean(file.fileName)}`,`maintenance:${file.path}`,()=>stored(file,'maintenance'));for(const material of maintenance.materials||[])for(const photo of material.photos)await addBlob(`Mantenimiento/Archivos/${clean(plate)}/${clean(material.name)}-${clean(photo.id)}.${extension('',photo.mimeType)}`,`material:${photo.path}`,async()=>fetchFile(await materialPhotoUrl(photo.path)))}
  onProgress({percent:66,label:'Preparando documentación y multas'})
  await addWorkbook('ITV y Documentación/itv_documentacion.xlsx',byName('ITV y documentación'))
  await addWorkbook('Multas e Impuestos/multas_impuestos.xlsx',byName('Multas e impuestos'))
  onProgress({percent:74,label:'Preparando calendario y alertas'})
  const customers=new Map(state.customers.map(item=>[item.id,item.name])),vehicles=new Map(state.vehicles.map(item=>[item.id,`${vehicleLabel(item)} · ${item.plate}`]))
  await addWorkbook('Calendario y Alertas/alertas.xlsx',[simpleSheet('Alertas',['Fecha','Hora','Tipo','Título','Descripción','Cliente','Vehículo','Antelación','Repetición','Estado','Prioridad'],state.events.map(event=>[event.date,event.time||'',event.type,event.title,event.description||'',customers.get(event.customerId||'')||'',vehicles.get(event.vehicleId||'')||'',(event.reminders||[]).map(reminder=>`${reminder.value} ${reminder.unit}`).join(', '),event.recurrence?`Cada ${event.recurrence.interval} ${event.recurrence.unit}`:'',event.status||'active',event.priority||'']))])
  onProgress({percent:82,label:'Preparando informes y configuración'})
  await addWorkbook('Informes/resumen.xlsx',byName('Resumen','Gastos','Últimos movimientos'))
  const settings=state.adminSettings,report=buildReport(state,today)
  await addWorkbook('Configuración/configuracion.xlsx',[simpleSheet('Configuración',['Configuración','Valor'],[['Empresa',settings.company],['Responsable',settings.name],['Email',settings.email],['Teléfono',settings.phone],['Alertas activadas',settings.notifications?.enabled?'Sí':'No'],['Categorías de alerta',(settings.notifications?.categories||[]).join(', ')],['Zona horaria',settings.notifications?.timezone||'Europe/Madrid'],['Ingresos cobrados',report.summary.totalPaid],['Gastos del mes',report.summary.monthExpenses]])])
  root.file('LEEME.txt',`COPIA ADMINISTRATIVA DE MONKEY RENTALS\nGenerada: ${now.toLocaleString('es-ES')}\n\nLos archivos Excel y adjuntos pueden abrirse sin la aplicación. Esta copia contiene información privada y debe guardarse en un lugar seguro. La restauración automática de la app sigue utilizando la copia técnica JSON disponible en Configuración.`)
  root.file('Copia técnica/monkey-rentals-backup.json',JSON.stringify(createBackup(state,ownerId,now),null,2))
  if(errors.length)root.file('errores_backup.txt',`La copia se completó, pero algunos elementos no pudieron incluirse:\n\n${errors.join('\n')}`)
  onProgress({percent:90,label:'Comprimiendo archivos'})
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}},metadata=>onProgress({percent:90+Math.round(metadata.percent/10),label:'Comprimiendo archivos'}))
  onProgress({percent:100,label:'Copia finalizada'})
  return {blob,filename:administrativeBackupFilename(now),errors}
}

export async function downloadAdministrativeBackup(state:FleetState,ownerId:string|null,onProgress?:BackupProgressHandler,now=new Date()) {const result=await createAdministrativeBackup(state,ownerId,onProgress,now);downloadBlob(result.blob,result.filename);return result}
