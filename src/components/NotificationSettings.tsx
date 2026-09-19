import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useFleet } from '../store/FleetContext'
import { defaultTimezone, reminderCategories } from '../lib/reminders'
import { deviceIsActive, disableDevice, enableDevice, supportsPush } from '../lib/pushNotifications'
import type { NotificationSettings } from '../types'
export function NotificationSettingsPanel() {
  const {state,ownerId,updateSettings,syncStatus}=useFleet()
  const prefs=state.adminSettings.notifications||{enabled:false,categories:Object.keys(reminderCategories) as NotificationSettings['categories'],timezone:defaultTimezone}
  const [active,setActive]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  useEffect(()=>{let cancelled=false;deviceIsActive().then(value=>{if(!cancelled)setActive(value)}).catch(()=>{if(!cancelled)setMessage('No se ha podido comprobar el registro de este dispositivo.')});return()=>{cancelled=true}},[ownerId])
  const save=(patch:Partial<NotificationSettings>)=>updateSettings({...state.adminSettings,notifications:{...prefs,...patch}})
  const toggle=async()=>{
    if(!ownerId)return
    setBusy(true);setMessage('')
    try {
      if(active){await disableDevice();setActive(false);setMessage('Notificaciones desactivadas en este dispositivo.')}
      else {await enableDevice(ownerId);save({enabled:true});setActive(true);setMessage('Dispositivo registrado. Recibirás los avisos configurados cuando se sincronicen con la nube.')}
    }catch(error){setMessage(error instanceof Error?error.message:'No se ha podido actualizar el permiso.')}
    finally{setBusy(false)}
  }
  return <section className="card mt-5 p-5 sm:p-6" aria-label="Configuración de notificaciones"><h2 className="flex items-center gap-2 font-display text-xl font-bold"><Bell size={22}/> Notificaciones</h2><p className="mt-2 text-sm text-stone-500">Activa las notificaciones para recibir avisos de Monkey Rentals en tu dispositivo, incluso con la app cerrada.</p><p className="mt-2 text-sm text-stone-500">En iPhone o iPad, añade la app a la pantalla de inicio desde Safari y ábrela desde su icono. Los avisos internos funcionan aunque no concedas permiso.</p>
    <button type="button" className="btn-primary mt-4" disabled={busy||!ownerId||syncStatus==='loading'||!supportsPush()} onClick={()=>void toggle()}>{busy?'Configurando…':active?'Desactivar en este dispositivo':'Activar notificaciones'}</button>
    {!supportsPush()&&<p className="mt-3 text-sm">Las notificaciones push no están disponibles en este navegador o modo de apertura.</p>}
    {message&&<p className="mt-3 text-sm font-semibold" role="status">{message}</p>}
    <label className="mt-5 flex items-center gap-3"><input type="checkbox" checked={prefs.enabled} onChange={e=>save({enabled:e.target.checked})}/><span>Permitir notificaciones en mis dispositivos registrados</span></label>
    <fieldset className="mt-4 grid gap-3 sm:grid-cols-2"><legend className="mb-3 font-bold">Categorías de avisos</legend>{Object.entries(reminderCategories).map(([key,label])=><label key={key} className="flex items-center gap-3"><input type="checkbox" checked={prefs.categories.includes(key as keyof typeof reminderCategories)} onChange={e=>save({categories:e.target.checked?[...prefs.categories,key as keyof typeof reminderCategories]:prefs.categories.filter(c=>c!==key)})}/><span>{label}</span></label>)}</fieldset>
    <label className="mt-5 block max-w-sm"><span className="label">Zona horaria para nuevas alertas</span><select className="field" value={prefs.timezone} onChange={e=>save({timezone:e.target.value})}><option value="Europe/Madrid">España peninsular · Europe/Madrid</option><option value="Atlantic/Canary">Canarias · Atlantic/Canary</option><option value="UTC">UTC</option>{!['Europe/Madrid','Atlantic/Canary','UTC'].includes(prefs.timezone)&&<option>{prefs.timezone}</option>}</select></label>
    <p className="mt-3 text-xs text-stone-500">Cada alerta conserva su zona horaria. Las categorías controlan los avisos configurados manualmente; los vencimientos automáticos siguen apareciendo en la app. El envío necesita conexión y puede retrasarse por el sistema del dispositivo.</p>
  </section>
}
