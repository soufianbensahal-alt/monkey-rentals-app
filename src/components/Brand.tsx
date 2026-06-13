import { Link } from 'react-router-dom'

export function Brand({ compact=false }: { compact?:boolean; light?:boolean }) {
  return <Link to="/" className={`inline-flex items-center rounded-lg ${compact?'justify-center':'gap-3'}`} aria-label="Monkey Rentals, inicio">
    <img src="/monkey-rentals-logo.jpeg" alt="" width={compact?36:48} height={compact?36:48} className={`${compact?'size-9':'size-12'} shrink-0 rounded-full object-cover shadow-sm ring-1 ring-orange-200`} />
    {!compact && <span className="font-display text-lg font-extrabold tracking-tight text-ink">Monkey <span className="text-brand-500">Rentals</span></span>}
  </Link>
}
