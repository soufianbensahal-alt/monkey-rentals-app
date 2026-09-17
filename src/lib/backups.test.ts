import { createBackup, parseBackup, restoreBackup, nextBackupDate, backupFilename, type BackupPreferences } from './backups'
import { emptyState } from '../data/emptyState'
const owner='user-a'
const state=()=>structuredClone(emptyState)
describe('copias de seguridad',()=>{
  it('conserva todos los registros y excluye archivos adjuntos',()=>{
    const data=state()
    data.customers=[{id:'c',name:'Cliente',email:'',phone:'',dni:'',rentals:0}]
    data.clientDocuments=[{id:'doc',customerId:'c',type:'Otro',fileName:'doc.pdf',mimeType:'application/pdf',size:20,uploadedAt:'2026-09-17',dataUrl:'data:application/pdf;base64,AAAA',notes:''}]
    data.tasks=[{id:'t',title:'Tarea',dueDate:'2026-09-17',priority:'alta',completed:false,category:'general'}]
    const copy=createBackup(data,owner)
    expect(copy.data.clientDocuments[0].dataUrl).toBe('')
    expect(data.clientDocuments[0].dataUrl).not.toBe('')
    expect(parseBackup(JSON.stringify(copy),owner).data.tasks).toEqual(data.tasks)
    expect(copy.data.customers).toEqual(data.customers)
  })
  it('rechaza cuentas diferentes, falta de sesión, formatos, versiones y campos inesperados',()=>{
    const copy=createBackup(state(),owner)
    expect(()=>parseBackup(JSON.stringify(copy),'user-b')).toThrow('otra cuenta')
    expect(()=>createBackup(state(),null)).toThrow('Inicia sesión')
    expect(()=>parseBackup('{',owner)).toThrow('JSON')
    expect(()=>parseBackup(JSON.stringify({...copy,backup_version:'2'}),owner)).toThrow('compatible')
    expect(()=>parseBackup(JSON.stringify({...copy,data:{...copy.data,token:'secret'}}),owner)).toThrow('campos')
    expect(()=>parseBackup(JSON.stringify(copy).replace('"version":4','"__proto__":{},"version":4'),owner)).toThrow('campos')
  })
  it('rechaza campos con tipos erróneos y registros duplicados',()=>{
    const data=state();data.tasks=[{id:'t',title:'test',dueDate:'2026-09-17',priority:'alta',completed:false,category:''}]
    const copy=createBackup(data,owner)
    expect(()=>parseBackup(JSON.stringify(copy).replace('"completed":false','"completed":"false"'),owner)).toThrow()
    copy.data.tasks.push(copy.data.tasks[0]);expect(()=>parseBackup(JSON.stringify(copy),owner)).toThrow('duplicados')
  })
  it('importa sin sobrescribir y reemplaza solo cuando se selecciona ese modo',()=>{
    const current=state(), incoming=state()
    current.customers=[{id:'c',name:'Actual',email:'',phone:'',dni:'',rentals:0}]
    incoming.customers=[{...current.customers[0],name:'Anterior'},{...current.customers[0],id:'c2'}]
    incoming.adminSettings.name='Anterior'
    const copy=createBackup(incoming,owner)
    expect(restoreBackup(current,copy,'merge').customers.map(c=>c.name)).toEqual(['Actual','Actual'])
    expect(restoreBackup(current,copy,'merge').adminSettings).toEqual(current.adminSettings)
    expect(restoreBackup(current,copy,'replace').customers[0].name).toBe('Anterior')
    expect(current.customers).toHaveLength(1)
  })
  it('calcula frecuencias y meses cortos sin saltar un mes',()=>{
    const prefs:BackupPreferences={frequency:'monthly',enabledAt:'2026-01-31T12:00:00',history:[{date:'2026-01-31T12:00:00',status:'download',name:'test'}]}
    expect(nextBackupDate(prefs)?.getDate()).toBe(28)
    expect(nextBackupDate({...prefs,frequency:'manual'})).toBeNull()
    expect(nextBackupDate({...prefs,frequency:'weekly'})?.getDate()).toBe(7)
    expect(nextBackupDate({...prefs,history:[]})?.getTime()).toBe(new Date(prefs.enabledAt).getTime())
    expect(backupFilename(new Date(2026,8,17,13,45))).toBe('monkey-rentals-backup-2026-09-17-13-45.json')
  })
})
