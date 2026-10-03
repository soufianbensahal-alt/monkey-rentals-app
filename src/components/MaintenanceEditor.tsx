import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useFleet } from '../store/FleetContext'
import { Modal } from './ui'
import { PrivateFileView } from './PrivateFileView'
import { materialCategories, materialTotal, maintenanceCosts } from '../lib/maintenance'
import { discardStagedPhotos, materialPhotoUrl, uploadMaterialPhoto } from '../lib/materialPhotos'
import { deletePrivateFile, uploadPrivateFile } from '../lib/privateFiles'
import { euroWithCents as money, uid } from '../lib/format'
import type { MaintenanceFile, MaintenanceMaterial, MaintenanceRecord, MaterialPhoto } from '../types'

const editableNumber=(value:number|undefined)=>Number.isFinite(value)?value:''
const parseEditableNumber=(value:string)=>value===''?Number.NaN:Number(value)

export function MaterialPhotoView({photo}:{photo:MaterialPhoto}) {
  const [thumbnail,setThumbnail]=useState(''),[full,setFull]=useState(''),[error,setError]=useState('')
  const card=useRef<HTMLDivElement>(null)
  useEffect(()=>{let active=true,observer:IntersectionObserver|undefined;const load=()=>void materialPhotoUrl(photo.thumbnailPath).then(url=>active&&setThumbnail(url)).catch(()=>active&&setError('Fotografía no disponible'));if(typeof IntersectionObserver==='undefined')load();else{observer=new IntersectionObserver(items=>{if(items.some(item=>item.isIntersecting)){observer?.disconnect();load()}},{rootMargin:'160px'});if(card.current)observer.observe(card.current)}return()=>{active=false;observer?.disconnect()}},[photo.thumbnailPath])
  return <div ref={card} className="w-28">{thumbnail&&<img src={thumbnail} alt="Miniatura del material" loading="lazy" className="h-24 w-24 rounded-xl object-cover"/>}<button type="button" className="text-sm font-bold text-brand-600" onClick={()=>void materialPhotoUrl(photo.path).then(setFull).catch(()=>setError('No se ha podido abrir la fotografía'))}>Ver fotografía</button>{error&&<p role="status" className="text-xs">{error}</p>}{full&&<Modal title="Fotografía del material" onClose={()=>setFull('')} wide><div className="overflow-auto"><img src={full} alt="Material, pieza o justificante" className="mx-auto max-h-[72dvh] max-w-full object-contain [touch-action:pinch-zoom]"/></div><a href={full} download className="btn-secondary mt-4">Descargar</a></Modal>}</div>
}

export function MaintenanceEditor({item,onClose,onSaved}:{item:MaintenanceRecord;onClose:()=>void;onSaved?:()=>void}) {
  const {state,upsertConfirmed,upsert}=useFleet()
  const [draft,setDraft]=useState<MaintenanceRecord>(()=>({...item,id:item.id||uid('m'),attachments:item.attachments||[]}))
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const stagedPhotos=useRef<MaterialPhoto[]>([]),stagedFiles=useRef<MaintenanceFile[]>([]),removedFiles=useRef<MaintenanceFile[]>([]),saved=useRef(false)
  useEffect(()=>()=>{if(!saved.current){void discardStagedPhotos(stagedPhotos.current).catch(()=>{});for(const file of stagedFiles.current)void deletePrivateFile(file,'maintenance').catch(()=>{})}},[])
  const set=(patch:Partial<MaintenanceRecord>)=>setDraft(d=>({...d,...patch}))
  const update=(id:string,patch:Partial<MaintenanceMaterial>)=>setDraft(d=>({...d,materials:d.materials?.map(m=>m.id===id?{...m,...patch}:m)}))
  const costs=maintenanceCosts(draft)
  const add=()=>set({materials:[...(draft.materials||[]),{id:uid('material'),name:'',category:'Otros',quantity:1,unitPrice:0,purchaseDate:draft.date,notes:'',photos:[]}]})
  const uploadMaterial=async(id:string,files:FileList|null)=>{
    const material=draft.materials?.find(m=>m.id===id);if(!files||!material)return
    if(files.length+material.photos.length>5){setError('Máximo 5 fotografías por material.');return}
    setBusy(true);setError('')
    try {for(const file of Array.from(files)){const photo=await uploadMaterialPhoto(file,draft.vehicleId,draft.id,id);stagedPhotos.current.push(photo);setDraft(d=>({...d,materials:d.materials?.map(m=>m.id===id?{...m,photos:[...m.photos,photo]}:m)}))}}
    catch(err){setError(err instanceof Error?err.message:'No se ha podido subir la fotografía.')}finally{setBusy(false)}
  }
  const uploadAttachment=async(files:FileList|null)=>{
    if(!files?.length)return
    setBusy(true);setError('')
    try {for(const file of Array.from(files)){const stored=await uploadPrivateFile(file,{type:'maintenance',recordId:draft.id,vehicleId:draft.vehicleId}) as MaintenanceFile;stagedFiles.current.push(stored);setDraft(d=>({...d,attachments:[...(d.attachments||[]),stored]}))}}
    catch(err){setError(err instanceof Error?err.message:'No se ha podido subir el archivo.')}finally{setBusy(false)}
  }
  const removeAttachment=(file:MaintenanceFile)=>{setDraft(d=>({...d,attachments:(d.attachments||[]).filter(x=>x.id!==file.id)}));if(!stagedFiles.current.some(x=>x.id===file.id))removedFiles.current.push(file)}
  const save=async(e:FormEvent)=>{
    e.preventDefault();if(busy)return;setBusy(true);setError('')
    try {
      const record={...draft,cost:costs.total}
      if(!upsertConfirmed){upsert('maintenance',record);saved.current=true;onSaved?.();onClose();return}
      await upsertConfirmed('maintenance',record)
      const retainedPhotos=new Set((draft.materials||[]).flatMap(m=>m.photos.map(p=>p.id)))
      const removedPhotos=(item.materials||[]).flatMap(m=>m.photos).filter(p=>!retainedPhotos.has(p.id))
      const retainedFiles=new Set((draft.attachments||[]).map(file=>file.id))
      await Promise.all([...removedFiles.current.map(file=>deletePrivateFile(file,'maintenance')),...stagedFiles.current.filter(file=>!retainedFiles.has(file.id)).map(file=>deletePrivateFile(file,'maintenance')),...(removedPhotos.length?[discardStagedPhotos(removedPhotos)]:[])])
      saved.current=true
      await discardStagedPhotos(stagedPhotos.current.filter(p=>!retainedPhotos.has(p.id)))
      onSaved?.();onClose()
    } catch(err){setError(err instanceof Error?err.message:'No se ha podido confirmar el mantenimiento en Supabase.')}finally{setBusy(false)}
  }
  return <Modal title={item.id?'Editar mantenimiento':'Añadir mantenimiento'} onClose={()=>{if(!busy)onClose()}}><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 sm:col-span-2">{error}</p>}
    <label><span className="label">Vehículo</span><select className="field" required value={draft.vehicleId} onChange={e=>set({vehicleId:e.target.value})}>{state.vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {v.name||v.model}</option>)}</select></label>
    <label><span className="label">Intervención</span><input className="field" required value={draft.type} onChange={e=>set({type:e.target.value})}/></label>
    <label><span className="label">Fecha</span><input className="field" type="date" required value={draft.date} onChange={e=>set({date:e.target.value})}/></label>
    <label><span className="label">Estado</span><select className="field" value={draft.status} onChange={e=>set({status:e.target.value as MaintenanceRecord['status']})}><option value="programado">Pendiente</option><option value="en curso">En curso</option><option value="completado">Finalizado</option></select></label>
    {costs.legacy?<LegacyCosts draft={draft} set={set}/>:<DetailedCosts draft={draft} set={set} update={update} add={add} busy={busy} costs={costs} uploadMaterial={uploadMaterial}/>}
    <fieldset className="space-y-3 rounded-xl border border-orange-100 p-4 sm:col-span-2"><legend className="px-2 font-display text-lg font-bold">Fotos, facturas y documentos</legend><p className="text-sm text-stone-500">PDF, JPG, PNG o WebP. Máximo 10 MB por archivo. Las imágenes se optimizan manteniendo calidad de lectura.</p><div className="flex flex-wrap gap-3">{(draft.attachments||[]).map(file=><PrivateFileView key={file.id} file={file} target="maintenance" onRemove={()=>removeAttachment(file)}/>)}</div><label><span className="label">Adjuntar desde galería o archivos</span><input className="field" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple disabled={busy} onChange={e=>{void uploadAttachment(e.target.files);e.target.value=''}}/></label><label><span className="label">Hacer foto</span><input className="field" type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>{void uploadAttachment(e.target.files);e.target.value=''}}/></label></fieldset>
    <label className="sm:col-span-2"><span className="label">Notas</span><textarea className="field" value={draft.notes} onChange={e=>set({notes:e.target.value})}/></label><div className="sm:col-span-2 flex justify-end gap-3"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy}>{busy?'Guardando en Supabase…':'Guardar mantenimiento'}</button></div>
  </form></Modal>
}

function LegacyCosts({draft,set}:{draft:MaintenanceRecord;set:(patch:Partial<MaintenanceRecord>)=>void}) {return <><label><span className="label">Importe total (€)</span><input type="number" min="0" step=".01" className="field" value={editableNumber(draft.cost)} onChange={e=>set({cost:parseEditableNumber(e.target.value)})}/></label><div><p className="mb-2 text-sm text-stone-500">El importe existente se conserva. Al desglosarlo, distribúyelo para no volver a sumar materiales ya incluidos.</p><button type="button" className="btn-secondary" onClick={()=>set({laborCost:draft.cost,otherCost:0,materials:[]})}>Desglosar costes</button></div></>}

function DetailedCosts({draft,set,update,add,busy,costs,uploadMaterial}:{draft:MaintenanceRecord;set:(p:Partial<MaintenanceRecord>)=>void;update:(id:string,p:Partial<MaintenanceMaterial>)=>void;add:()=>void;busy:boolean;costs:ReturnType<typeof maintenanceCosts>;uploadMaterial:(id:string,f:FileList|null)=>Promise<void>}) {return <>
  <label><span className="label">Mano de obra (€)</span><input className="field" type="number" min="0" step=".01" required value={editableNumber(draft.laborCost)} onChange={e=>set({laborCost:parseEditableNumber(e.target.value)})}/></label><label><span className="label">Otros gastos (€)</span><input className="field" type="number" min="0" step=".01" required value={editableNumber(draft.otherCost)} onChange={e=>set({otherCost:parseEditableNumber(e.target.value)})}/></label>
  <fieldset className="sm:col-span-2 space-y-4"><legend className="mb-3 font-display text-xl font-bold">Materiales y repuestos</legend>{draft.materials?.map((m,index)=><div key={m.id} className="grid gap-3 rounded-xl border border-orange-100 p-4 sm:grid-cols-2">
    <label><span className="label">Nombre del material {index+1}</span><input required className="field" value={m.name} onChange={e=>update(m.id,{name:e.target.value})}/></label><label><span className="label">Categoría</span><select className="field" value={m.category} onChange={e=>update(m.id,{category:e.target.value})}>{materialCategories.map(c=><option key={c}>{c}</option>)}</select></label>
    <label><span className="label">Cantidad</span><input required type="number" min=".001" step=".001" className="field" value={editableNumber(m.quantity)} onChange={e=>update(m.id,{quantity:parseEditableNumber(e.target.value)})}/></label><label><span className="label">Precio unitario (€)</span><input required type="number" min="0" step=".01" className="field" value={editableNumber(m.unitPrice)} onChange={e=>update(m.id,{unitPrice:parseEditableNumber(e.target.value)})}/></label>
    <label><span className="label">Proveedor (opcional)</span><input className="field" value={m.supplier||''} onChange={e=>update(m.id,{supplier:e.target.value})}/></label><label><span className="label">Referencia / pieza (opcional)</span><input className="field" value={m.reference||''} onChange={e=>update(m.id,{reference:e.target.value})}/></label><label><span className="label">Fecha de compra</span><input className="field" type="date" required value={m.purchaseDate} onChange={e=>update(m.id,{purchaseDate:e.target.value})}/></label><p className="self-center font-bold">Total: {money.format(materialTotal(m))}</p>
    <label className="sm:col-span-2"><span className="label">Notas del material</span><textarea className="field" value={m.notes} onChange={e=>update(m.id,{notes:e.target.value})}/></label><div className="sm:col-span-2"><p className="text-sm text-stone-500">Fotografías: {m.photos.length}/5</p><div className="my-3 flex flex-wrap gap-3">{m.photos.map(photo=><MaterialPhotoView photo={photo} key={photo.id}/>)}</div><label className="label">Galería o archivo<input className="field" type="file" accept="image/*" multiple disabled={busy||m.photos.length>=5} onChange={e=>{void uploadMaterial(m.id,e.target.files);e.target.value=''}}/></label></div>
    <button type="button" className="btn-secondary" disabled={busy} onClick={()=>set({materials:draft.materials?.filter(x=>x.id!==m.id)})}>Quitar material</button>
  </div>)}<button type="button" className="btn-secondary" disabled={busy} onClick={add}>Añadir material</button></fieldset><p className="sm:col-span-2">Mano de obra: {money.format(costs.labor)} · Materiales: {money.format(costs.materials)} · Otros: {money.format(costs.other)}<br/><strong>Total mantenimiento: {money.format(costs.total)}</strong></p>
</>}
