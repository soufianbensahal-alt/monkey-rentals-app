import { useEffect, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { useFleet } from '../store/FleetContext'
import { Modal } from './ui'
import { backupFilename, collectionLabels, collections, createBackup, downloadBackup, frequencies, nextBackupDate, parseBackup, type Backup, type BackupPreferences, type Frequency, type RestoreMode } from '../lib/backups'

interface BackupDirectory {
  name:string
  getFileHandle:(name:string,options:{create:boolean})=>Promise<{createWritable:()=>Promise<{write:(data:string)=>Promise<void>;close:()=>Promise<void>}>}>
}
type DirectoryWindow = Window & {showDirectoryPicker?:()=>Promise<BackupDirectory>}

function readPreferences(owner:string|null):BackupPreferences {
  const fallback:BackupPreferences={frequency:'manual',enabledAt:new Date().toISOString(),history:[]}
  if (!owner) return fallback
  try {
    const data=JSON.parse(localStorage.getItem(`monkey-backups:${owner}`)||'null')
    if (!data || !Object.hasOwn(frequencies,data.frequency) || !Number.isFinite(Date.parse(data.enabledAt)) || !Array.isArray(data.history)) return fallback
    return {...data,history:data.history.filter((h:{date:string;status:string;name:string})=>h && Number.isFinite(Date.parse(h.date)) && ['download','saved','error'].includes(h.status) && typeof h.name==='string').slice(0,20)}
  } catch { return fallback }
}
function useBackups() {
  const {state,ownerId,syncStatus}=useFleet()
  const [prefs,setPrefs]=useState(()=>readPreferences(ownerId))
  const [message,setMessage]=useState('')
  const [now,setNow]=useState(Date.now)
  const [busy,setBusy]=useState(false)
  useEffect(()=>{
    const update=()=>{setPrefs(readPreferences(ownerId));setNow(Date.now())}
    update()
    window.addEventListener('monkey-backups',update); window.addEventListener('storage',update)
    const timer=window.setInterval(()=>setNow(Date.now()),60000)
    return ()=>{window.removeEventListener('monkey-backups',update);window.removeEventListener('storage',update);window.clearInterval(timer)}
  },[ownerId])
  const persist=(next:BackupPreferences)=>{
    if (!ownerId) throw new Error('Inicia sesión para gestionar tus copias.')
    localStorage.setItem(`monkey-backups:${ownerId}`,JSON.stringify(next));setPrefs(next)
    window.dispatchEvent(new Event('monkey-backups'))
  }
  const allowed=Boolean(ownerId)&&syncStatus!=='loading'
  const create=()=>{
    try {
      if (!allowed) throw new Error('Espera a que termine la carga de tu cuenta.')
      const name=backupFilename(), backup=createBackup(state,ownerId)
      downloadBackup(backup,name)
      const next={...readPreferences(ownerId),history:[{date:backup.generated_at,status:'download' as const,name},...readPreferences(ownerId).history].slice(0,20)}
      try { persist(next);setMessage('Descarga iniciada. Comprueba que el archivo está guardado en tu dispositivo.') }
      catch { setMessage('Descarga iniciada, pero el navegador no ha permitido guardar el historial.') }
    } catch(error) {
      setMessage(error instanceof Error?error.message:'No se ha podido crear la copia.')
      try { persist({...prefs,history:[{date:new Date().toISOString(),status:'error' as const,name:'Error al crear la copia'},...prefs.history].slice(0,20)}) } catch { /* Se mantiene el error visible. */ }
    }
  }
  const saveInFolder=async()=>{
    if (!(window as DirectoryWindow).showDirectoryPicker || !allowed) return
    setBusy(true)
    try {
      const snapshot=createBackup(state,ownerId), name=backupFilename()
      const directory=await (window as DirectoryWindow).showDirectoryPicker!()
      const file=await directory.getFileHandle(name,{create:true})
      const writable=await file.createWritable()
      await writable.write(JSON.stringify(snapshot,null,2));await writable.close()
      try {
        const current=readPreferences(ownerId)
        persist({...current,history:[{date:snapshot.generated_at,status:'saved' as const,name},...current.history].slice(0,20)})
        setMessage(`Copia guardada en la carpeta ${directory.name}.`)
      } catch {setMessage('Copia guardada en la carpeta, pero no se ha podido actualizar el historial.')}
    } catch(error) {
      if (error instanceof DOMException && error.name==='AbortError') setMessage('Guardado cancelado. Puedes descargar la copia cuando quieras.')
      else setMessage('No se ha podido guardar en la carpeta. Usa Crear copia de seguridad ahora para descargarla.')
    } finally {setBusy(false)}
  }
  const next=nextBackupDate(prefs)
  return {prefs,persist,message,setMessage,create,saveInFolder,busy,allowed,next,due:allowed&&Boolean(next&&next.getTime()<=now)}
}
const format=(value:string|Date)=>new Date(value).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'})

export function BackupReminder() {
  const backup=useBackups()
  if (!backup.due && !backup.message) return null
  return <section className="card mb-5 p-5" aria-label="Aviso de copia de seguridad"><p className="font-bold">Hoy toca crear una copia de seguridad</p><p className="mt-1 text-sm text-stone-500">Descárgala ahora para proteger tus datos.</p><button className="btn-primary mt-3" onClick={backup.create}><Download size={18}/> Crear copia ahora</button>{backup.message&&<p role="status" className="mt-3 text-sm">{backup.message}</p>}</section>
}
export function BackupSettings() {
  const {ownerId,syncStatus,restoreFromBackup}=useFleet()
  const backup=useBackups()
  const [preview,setPreview]=useState<Backup|null>(null)
  const [mode,setMode]=useState<RestoreMode>('merge')
  const [confirmed,setConfirmed]=useState(false)
  const [reading,setReading]=useState(false)
  const last=backup.prefs.history.find(h=>h.status!=='error')
  const restore=()=>{
    if (!preview || !confirmed) return
    try {
      restoreFromBackup(JSON.stringify(preview),mode)
      setPreview(null)
      backup.setMessage('Datos restaurados. La sincronización con la nube continuará con el sistema habitual; revisa su estado antes de cerrar la app.')
    } catch(error) { backup.setMessage(error instanceof Error?error.message:'No se ha podido restaurar la copia.');setPreview(null) }
  }
  return <section id="copias-seguridad" className="card mt-5 p-5 sm:p-6">
    <h2 className="font-display text-xl font-bold">Copias de seguridad</h2>
    <p className="mt-2 text-sm text-stone-500">Descarga tus datos en un archivo JSON y consérvalo en tu ordenador, USB o disco externo. Contiene información privada de tu negocio.</p>
    <p className="mt-2 text-sm text-stone-500">Incluye clientes, flota, alquileres y reservas, pagos y recordatorios, calendario, tareas, mantenimiento, impuestos, multas y configuración. Los informes y las alertas se reconstruyen con estos datos. Los documentos de clientes incluyen solo referencias: guarda sus archivos por separado.</p>
    {!ownerId&&<p className="mt-3 font-semibold">Inicia sesión en tu cuenta para crear o restaurar copias.</p>}
    {syncStatus==='offline'&&<p className="mt-3 text-sm">Sin conexión: la copia incluirá los últimos datos disponibles en este dispositivo.</p>}
    {backup.due&&<p className="mt-4 font-bold text-brand-600">Tienes una copia pendiente. Descárgala ahora para proteger tus datos.</p>}
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <button className="btn-primary" disabled={!backup.allowed} onClick={backup.create}><Download size={18}/> Crear copia de seguridad ahora</button>
      <label className={`btn-secondary cursor-pointer ${!backup.allowed||reading?'pointer-events-none opacity-50':''}`}><Upload size={18}/> {reading?'Leyendo copia…':'Restaurar copia de seguridad'}<input aria-label="Seleccionar copia de seguridad" className="sr-only" type="file" accept=".json,application/json" disabled={!backup.allowed||reading} onChange={async event=>{
        const file=event.target.files?.[0];event.target.value='';if(!file)return
        setReading(true);backup.setMessage('');setPreview(null)
        try {
          if(file.size>50*1024*1024)throw new Error('La copia supera el límite de 50 MB.')
          const parsed=parseBackup(await file.text(),ownerId);setPreview(parsed);setMode('merge');setConfirmed(false)
        } catch(error) {backup.setMessage(error instanceof Error?error.message:'No se ha podido leer la copia.')}
        finally{setReading(false)}
      }}/></label>
      {(window as DirectoryWindow).showDirectoryPicker&&<button className="btn-secondary" disabled={!backup.allowed||backup.busy} onClick={()=>void backup.saveInFolder()}>{backup.busy?'Guardando…':'Guardar en una carpeta…'}</button>}
    </div>
    <label className="mt-5 block max-w-md"><span className="label">Frecuencia de copia de seguridad</span><select className="field" disabled={!ownerId} value={backup.prefs.frequency} onChange={event=>{try {backup.persist({...backup.prefs,frequency:event.target.value as Frequency,enabledAt:new Date().toISOString()})} catch{backup.setMessage('No se ha podido guardar la frecuencia en este navegador.')}}}>{Object.entries(frequencies).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <p className="mt-2 text-xs text-stone-500">Los avisos aparecen al abrir la app. La descarga requiere pulsar el botón. La frecuencia y el historial se guardan por cuenta en este navegador.</p>
    <dl className="mt-5 grid gap-3 sm:grid-cols-2"><div><dt className="text-sm text-stone-500">Última copia</dt><dd className="font-bold">{last?format(last.date):'Todavía no hay copias'}</dd></div><div><dt className="text-sm text-stone-500">Próxima copia recomendada</dt><dd className="font-bold">{backup.next?format(backup.next):'Solo manual'}</dd></div></dl>
    {backup.message&&<p role="status" className="mt-4 text-sm font-semibold">{backup.message}</p>}
    {backup.prefs.history.length>0&&<details className="mt-5"><summary className="cursor-pointer font-bold">Historial de copias</summary><ul className="mt-3 space-y-2 text-sm">{backup.prefs.history.map((item,index)=><li className="break-words" key={`${item.date}-${index}`}>{format(item.date)} · {item.status==='error'?'Error':item.status==='saved'?'Guardada':'Descarga iniciada'} · {item.name}</li>)}</ul></details>}
    {preview&&<Modal title="Restaurar copia de seguridad" onClose={()=>setPreview(null)}><p>Copia del {format(preview.generated_at)}. Restaurar una copia de seguridad puede modificar los datos actuales.</p><dl className="my-4 grid grid-cols-2 gap-2 text-sm">{collections.map((key,index)=><div key={key}><dt>{collectionLabels[index]}</dt><dd className="font-bold">{preview.data[key].length}</dd></div>)}</dl><p className="mb-4 text-sm">Los archivos adjuntos que ya no estén en la app deberán añadirse de nuevo.</p><label className="block"><span className="label">Modo de restauración</span><select className="field" value={mode} onChange={e=>{setMode(e.target.value as RestoreMode);setConfirmed(false)}}><option value="merge">Importar sin borrar datos actuales</option><option value="replace">Reemplazar datos actuales</option></select></label><p className="mt-3 text-sm">{mode==='merge'?'Se añaden los registros que falten. Si un identificador ya existe, se conserva el registro actual y la configuración actual.':'Esta acción reemplazará los datos actuales por los datos de la copia. No se puede deshacer. Crea antes una copia de los datos actuales.'}</p><label className="my-5 flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>He revisado el resumen y confirmo que quiero {mode==='replace'?'reemplazar los datos actuales':'importar esta copia'}.</span></label><div className="flex flex-wrap justify-end gap-3"><button className="btn-secondary" onClick={()=>setPreview(null)}>Cancelar</button><button className="btn-primary" disabled={!confirmed||syncStatus==='loading'||syncStatus==='saving'} onClick={restore}>Restaurar copia</button></div></Modal>}
  </section>
}
