import { X, Inbox, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Badge({ children, tone='neutral' }: { children:ReactNode; tone?:'success'|'warning'|'danger'|'info'|'neutral' }) {
  const styles = { success:'bg-emerald-50 text-emerald-700 ring-emerald-200', warning:'bg-amber-50 text-amber-800 ring-amber-200', danger:'bg-red-50 text-red-700 ring-red-200', info:'bg-blue-50 text-blue-700 ring-blue-200', neutral:'bg-stone-100 text-stone-700 ring-stone-200' }
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold capitalize ring-1 ring-inset ${styles[tone]}`}>{children}</span>
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?:string; title:string; description:string; action?:ReactNode }) {
  return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div><p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-brand-600">{eyebrow}</p><h1 className="font-display text-3xl font-bold tracking-tight text-ink">{title}</h1><p className="mt-2 max-w-2xl text-stone-600">{description}</p></div>{action}
  </div>
}

export function StatCard({ label, value, detail, icon:Icon, tone='orange' }: { label:string; value:string; detail:string; icon:LucideIcon; tone?:'orange'|'green'|'blue'|'red' }) {
  const tones = { orange:'bg-brand-50 text-brand-600', green:'bg-emerald-50 text-emerald-700', blue:'bg-blue-50 text-blue-700', red:'bg-red-50 text-red-700' }
  return <article className="card p-5"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-stone-500">{label}</p><p className="mt-2 font-display text-3xl font-bold tabular-nums text-ink">{value}</p></div><span className={`grid size-11 place-items-center rounded-xl ${tones[tone]}`}><Icon size={21} aria-hidden="true" /></span></div><p className="mt-3 text-xs font-medium text-stone-500">{detail}</p></article>
}

export function Modal({ title, children, onClose }: { title:string; children:ReactNode; onClose:()=>void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    panelRef.current?.focus()
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', closeOnEscape) }
  }, [onClose])
  const modal = <div className="fixed inset-0 z-[1000] flex h-dvh w-screen items-center justify-center overflow-hidden bg-stone-950/55 p-3 backdrop-blur-[2px] sm:p-6" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div ref={panelRef} tabIndex={-1} className="modal-panel flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_24px_80px_rgba(28,25,23,.28)] outline-none sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl">
      <div className="modal-header flex shrink-0 items-center justify-between border-b border-orange-100 bg-white px-5 py-4 sm:px-7 sm:py-5"><h2 id="modal-title" className="font-display text-xl font-bold text-ink sm:text-2xl">{title}</h2><button className="icon-btn shrink-0" onClick={onClose} aria-label="Cerrar"><X size={20}/></button></div>
      <div className="modal-body min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6 [&_form>div:last-child]:sticky [&_form>div:last-child]:bottom-0 [&_form>div:last-child]:z-10 [&_form>div:last-child]:border-t [&_form>div:last-child]:border-orange-100 [&_form>div:last-child]:bg-white [&_form>div:last-child]:py-4">
        {children}
      </div>
    </div>
  </div>
  return createPortal(modal, document.body)
}

export function EmptyState({ title, description, action }: { title:string; description:string; action?:ReactNode }) { return <div className="grid min-h-56 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Inbox/></span><h3 className="mt-4 font-bold text-ink">{title}</h3><p className="mt-1 text-sm text-stone-500">{description}</p>{action&&<div className="mt-5">{action}</div>}</div></div> }

export function ConfirmButton({ onConfirm, label='Eliminar' }: { onConfirm:()=>void; label?:string }) { return <button className="cursor-pointer font-semibold text-red-600 hover:text-red-800" onClick={onConfirm}>{label}</button> }
