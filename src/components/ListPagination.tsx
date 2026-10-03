import { ChevronLeft, ChevronRight } from 'lucide-react'

export function ListPagination({page,pages,total,onPage}:{page:number;pages:number;total:number;onPage:(page:number)=>void}) {
  if(pages<=1)return null
  return <nav className="flex items-center justify-between gap-3 border-t border-orange-100 bg-white px-4 py-3 text-sm" aria-label="Paginación">
    <span className="text-stone-500">Página {page} de {pages} · {total} registros</span>
    <span className="flex gap-2">
      <button type="button" className="btn-secondary min-h-9 px-3 py-1.5" disabled={page<=1} onClick={()=>onPage(page-1)} aria-label="Página anterior"><ChevronLeft size={16}/></button>
      <button type="button" className="btn-secondary min-h-9 px-3 py-1.5" disabled={page>=pages} onClick={()=>onPage(page+1)} aria-label="Página siguiente"><ChevronRight size={16}/></button>
    </span>
  </nav>
}
