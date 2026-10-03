import { Download, Eye, FileText, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { privateFileUrl, privateThumbnailUrl } from '../lib/privateFiles'
import type { PrivateFile } from '../types'
import { Modal } from './ui'

export function PrivateFileView({file,target,onRemove}:{file:PrivateFile;target:'maintenance'|'rental';onRemove?:()=>void}) {
  const [thumbnail,setThumbnail]=useState(''),[full,setFull]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false)
  const card=useRef<HTMLDivElement>(null)
  useEffect(()=>{let active=true,observer:IntersectionObserver|undefined;const load=()=>{if(file.thumbnailPath)void privateThumbnailUrl(file,target).then(url=>active&&setThumbnail(url)).catch(()=>active&&setError('Miniatura no disponible'))};if(!file.thumbnailPath)return()=>{active=false};if(typeof IntersectionObserver==='undefined')load();else{observer=new IntersectionObserver(items=>{if(items.some(item=>item.isIntersecting)){observer?.disconnect();load()}},{rootMargin:'160px'});if(card.current)observer.observe(card.current)}return()=>{active=false;observer?.disconnect()}},[file,target])
  const open=async()=>{setLoading(true);setError('');try{setFull(await privateFileUrl(file,target))}catch{setError('No se ha podido abrir el archivo.')}finally{setLoading(false)}}
  const download=async()=>{setLoading(true);setError('');try{const url=await privateFileUrl(file,target,true);const link=document.createElement('a');link.href=url;link.download=file.fileName;link.target='_blank';link.rel='noopener';link.click()}catch{setError('No se ha podido descargar el archivo.')}finally{setLoading(false)}}
  return <div ref={card} className="w-full max-w-52 rounded-xl border border-orange-100 bg-white p-2">
    <button type="button" onClick={()=>void open()} className="block w-full text-left" disabled={loading}>
      {thumbnail?<img src={thumbnail} alt="" loading="lazy" className="h-24 w-full rounded-lg object-cover"/>:<span className="grid h-24 place-items-center rounded-lg bg-stone-100 text-stone-500"><FileText size={32}/></span>}
      <span className="mt-2 block truncate text-xs font-bold text-ink" title={file.fileName}>{file.fileName}</span>
    </button>
    <div className="mt-2 flex gap-3 text-brand-700"><button type="button" aria-label="Ver archivo" onClick={()=>void open()}><Eye size={17}/></button><button type="button" aria-label="Descargar archivo" onClick={()=>void download()}><Download size={17}/></button>{onRemove&&<button type="button" aria-label="Eliminar archivo" className="text-red-600" onClick={()=>{if(window.confirm(`¿Eliminar ${file.fileName}?`))onRemove()}}><Trash2 size={17}/></button>}</div>
    {error&&<p className="mt-1 text-xs text-red-700">{error}</p>}
    {full&&<Modal title={file.fileName} onClose={()=>setFull('')} wide>{file.kind==='pdf'?<iframe src={full} title={file.fileName} className="h-[72dvh] w-full rounded-xl border"/>:<div className="overflow-auto text-center"><img src={full} alt={file.fileName} className="mx-auto max-h-[72dvh] max-w-full object-contain [touch-action:pinch-zoom]"/></div>}<button type="button" className="btn-secondary mt-4" onClick={()=>void download()}><Download size={17}/> Descargar</button></Modal>}
  </div>
}
