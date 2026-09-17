import schema from './backupSchema.json'
import type { FleetState } from '../types'

export const collections = ['vehicles','customers','rentals','payments','clientDocuments','tasks','maintenance','documents','taxes','fines','events'] as const
export const collectionLabels = ['Vehículos','Clientes','Alquileres y reservas','Pagos y recordatorios','Referencias de documentos de clientes','Tareas','Mantenimiento y reparaciones','ITV / Documentación','Impuestos','Multas','Calendario']
export type RestoreMode = 'merge' | 'replace'
export interface Backup { app:'Monkey Rentals'; backup_version:'1.0'; generated_at:string; user_id:string; data:FleetState }
export const frequencies = { manual:'Solo manual', daily:'Cada día', weekly:'Cada semana', biweekly:'Cada 15 días', monthly:'Cada mes' }
export type Frequency = keyof typeof frequencies
export interface BackupLog { date:string; status:'download'|'saved'|'error'; name:string }
export interface BackupPreferences { frequency:Frequency; enabledAt:string; history:BackupLog[] }
interface Schema { type?:string; const?:unknown; anyOf?:Schema[]; items?:Schema; properties?:Record<string,Schema>; required?:string[] }
function matches(value:unknown, rule:Schema):boolean {
  if (rule.anyOf) return rule.anyOf.some(r=>matches(value,r))
  if ('const' in rule) return value === rule.const
  if (rule.type === 'array') return Array.isArray(value) && value.length <= 100000 && value.every(v=>matches(v,rule.items!))
  if (rule.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const obj=value as Record<string,unknown>
    return (rule.required || []).every(k=>Object.hasOwn(obj,k)) && Object.keys(obj).every(k=>Object.hasOwn(rule.properties!,k) && matches(obj[k],rule.properties![k]))
  }
  return typeof value === rule.type && (typeof value !== 'number' || Number.isFinite(value))
}
export function parseBackup(text:string, owner:string|null):Backup {
  if (!owner) throw new Error('Inicia sesión para acceder a tus copias de seguridad.')
  if (text.length > 50 * 1024 * 1024) throw new Error('La copia supera el límite de 50 MB.')
  let value:Backup
  try { value=JSON.parse(text) } catch { throw new Error('El archivo no contiene JSON válido.') }
  if (!value || value.app !== 'Monkey Rentals' || value.backup_version !== '1.0') throw new Error('No es una copia compatible de Monkey Rentals.')
  if (value.user_id !== owner) throw new Error('Esta copia pertenece a otra cuenta.')
  if (Object.keys(value).some(k=>!['app','backup_version','generated_at','user_id','data'].includes(k)) || typeof value.generated_at !== 'string' || !Number.isFinite(Date.parse(value.generated_at)) || !matches(value.data,schema as Schema)) throw new Error('La copia contiene campos inesperados o datos incorrectos.')
  for (const key of collections) {
    const ids=value.data[key].map(item=>item.id)
    if (ids.some(id=>!id.trim() || ['__proto__','prototype','constructor'].includes(id)) || new Set(ids).size!==ids.length) throw new Error('La copia contiene identificadores vacíos o duplicados.')
  }
  if (value.data.clientDocuments.some(doc=>doc.dataUrl !== '')) throw new Error('Esta versión solo admite referencias de documentos, sin archivos adjuntos.')
  if (value.data.vehicles.some(v=>v.image && !/^(https?:\/\/|data:image\/(png|jpeg|webp|gif);base64,|\/[^/])/.test(v.image))) throw new Error('La copia contiene una imagen no válida.')
  return value
}
export function createBackup(state:FleetState, owner:string|null, now=new Date()):Backup {
  const data=structuredClone(state)
  data.clientDocuments=data.clientDocuments.map(doc=>({...doc,dataUrl:''}))
  return parseBackup(JSON.stringify({app:'Monkey Rentals',backup_version:'1.0',generated_at:now.toISOString(),user_id:owner,data}),owner)
}
export function restoreBackup(current:FleetState, backup:Backup, mode:RestoreMode):FleetState {
  const next=structuredClone(backup.data)
  for (const key of collections) {
    const existing=new Map(current[key].map(item=>[item.id,item]))
    const incoming=next[key].map(item=>key==='clientDocuments' && existing.has(item.id) ? {...item,dataUrl:(existing.get(item.id) as FleetState['clientDocuments'][number]).dataUrl} : item)
    const merged=mode==='merge' ? [...current[key],...incoming.filter(item=>!existing.has(item.id))] : incoming
    Object.assign(next,{[key]:merged})
  }
  if (mode==='merge') next.adminSettings=structuredClone(current.adminSettings)
  return next
}
export function backupFilename(now=new Date()) {
  const pad=(n:number)=>String(n).padStart(2,'0')
  return `monkey-rentals-backup-${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}.json`
}
export function nextBackupDate(prefs:BackupPreferences):Date|null {
  if (prefs.frequency==='manual') return null
  const last=prefs.history.find(h=>h.status!=='error')?.date
  if (!last) return new Date(prefs.enabledAt)
  const next=new Date(last)
  if (prefs.frequency==='monthly') {
    const day=next.getDate(); next.setDate(1); next.setMonth(next.getMonth()+1)
    const end=new Date(next.getFullYear(),next.getMonth()+1,0).getDate(); next.setDate(Math.min(day,end))
  } else next.setDate(next.getDate()+({daily:1,weekly:7,biweekly:15}[prefs.frequency]))
  return next
}
export function downloadBackup(backup:Backup, filename:string) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}))
  const link=document.createElement('a'); link.href=url; link.download=filename
  document.body.appendChild(link)
  try { link.click() } finally { link.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),1000) }
}
