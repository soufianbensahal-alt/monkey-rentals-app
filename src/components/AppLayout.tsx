import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  CalendarDays,
  Car,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  FileCheck2,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Search,
  Settings,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Brand } from './Brand'
import { useFleet } from '../store/FleetContext'
import { vehicleLabel } from '../lib/vehicles'
import { getSystemAlerts } from '../lib/alerts'

interface NavItem {
  to: string
  label: string
  desktopLabel?: string
  icon: LucideIcon
  end?: boolean
}

const primaryNav: NavItem[] = [
  { to: '/app', label: 'Inicio', desktopLabel: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/flota', label: 'Flota', icon: Car },
  { to: '/app/alquileres', label: 'Alquileres', icon: CalendarDays },
  { to: '/app/pagos', label: 'Pagos', icon: CreditCard },
  { to: '/app/clientes', label: 'Clientes', icon: Users },
]

const secondaryNav: NavItem[] = [
  { to: '/app/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/app/mantenimiento', label: 'Mantenimiento', icon: Wrench },
  { to: '/app/documentacion', label: 'ITV / Documentación', icon: FileCheck2 },
  { to: '/app/alertas', label: 'Alertas', icon: CircleAlert },
  { to: '/app/informes', label: 'Informes', icon: ChartNoAxesCombined },
  { to: '/app/configuracion', label: 'Configuración', icon: Settings },
]

const desktopNav: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/flota', label: 'Flota', icon: Car },
  { to: '/app/alquileres', label: 'Alquileres', icon: CalendarDays },
  { to: '/app/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/app/mantenimiento', label: 'Mantenimiento', icon: Wrench },
  { to: '/app/documentacion', label: 'ITV / Documentación', icon: FileCheck2 },
  { to: '/app/pagos', label: 'Pagos', icon: CreditCard },
  { to: '/app/clientes', label: 'Clientes', icon: Users },
  { to: '/app/alertas', label: 'Alertas', icon: CircleAlert },
  { to: '/app/informes', label: 'Informes', icon: ChartNoAxesCombined },
  { to: '/app/configuracion', label: 'Configuración', icon: Settings },
]

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [notices, setNotices] = useState(false)
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const deferredSearch = useDeferredValue(search)
  const { state, syncStatus, syncError, remoteEnabled, authEmail, signOut, retrySync } = useFleet()
  const location = useLocation()
  const navigate = useNavigate()
  const noticesRef = useRef<HTMLDivElement>(null)
  const noticesPanelRef = useRef<HTMLElement>(null)
  const alerts = getSystemAlerts(state)
  const current = desktopNav.find(item => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))?.label
    ?? 'Monkey Rentals'
  const secondaryActive = secondaryNav.some(item => item.to !== '/app/calendario' && location.pathname.startsWith(item.to))

  const results = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    if (!query) return []
    return [
      ...state.vehicles
        .filter(vehicle => `${vehicleLabel(vehicle)} ${vehicle.plate} ${vehicle.brand} ${vehicle.model} ${vehicle.status}`.toLowerCase().includes(query))
        .map(vehicle => ({ id: vehicle.id, title: vehicleLabel(vehicle), detail: `${vehicle.plate} · ${vehicle.status}`, to: '/app/flota' })),
      ...state.customers
        .filter(customer => `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase().includes(query))
        .map(customer => ({ id: customer.id, title: customer.name, detail: customer.email, to: '/app/clientes' })),
      ...state.rentals
        .filter(rental => {
          const customer = state.customers.find(item => item.id === rental.customerId)
          const vehicle = state.vehicles.find(item => item.id === rental.vehicleId)
          return `${customer?.name} ${vehicleLabel(vehicle)} ${vehicle?.plate} ${rental.status}`.toLowerCase().includes(query)
        })
        .map(rental => ({
          id: rental.id,
          title: state.customers.find(customer => customer.id === rental.customerId)?.name || 'Alquiler',
          detail: vehicleLabel(state.vehicles.find(vehicle => vehicle.id === rental.vehicleId)),
          to: '/app/alquileres',
        })),
    ].slice(0, 8)
  }, [deferredSearch, state])

  useEffect(() => {
    if (!notices) return
    const close = (event: PointerEvent) => {
      const target=event.target as Node
      if (!noticesRef.current?.contains(target) && !noticesPanelRef.current?.contains(target)) setNotices(false)
    }
    const closeOnEscape = (event:KeyboardEvent) => { if(event.key==='Escape') setNotices(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown',closeOnEscape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown',closeOnEscape) }
  }, [notices])

  const go = (to: string) => {
    navigate(to)
    setSearch('')
    setNotices(false)
    setMoreOpen(false)
  }
  const syncLabel = syncStatus === 'loading'
    ? 'Cargando'
    : syncStatus === 'saving'
      ? 'Guardando'
      : syncStatus === 'offline' || syncStatus === 'error'
        ? 'Sin conexión'
        : 'Sincronizado'

  const notificationLayer=notices?createPortal(<>
    <button className="fixed inset-0 z-[80] bg-stone-950/40 backdrop-blur-[1px]" onClick={() => setNotices(false)} aria-label="Cerrar notificaciones"/>
    <section ref={noticesPanelRef} className="notification-panel" role="dialog" aria-modal="true" aria-label="Notificaciones">
      <div className="flex shrink-0 items-center justify-between border-b border-orange-100 px-1 pb-3">
        <div><h2 className="font-display text-lg font-bold text-ink">Alertas</h2><p className="text-xs text-stone-500">{alerts.length} pendientes</p></div>
        <button className="icon-btn" onClick={() => setNotices(false)} aria-label="Cerrar alertas"><X size={18}/></button>
      </div>
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {alerts.length ? alerts.map(alert => <button key={alert.id} onClick={() => go(alert.to)} className="notification-item"><p className="text-sm font-bold text-ink">{alert.title}</p><p className="mt-1 text-xs leading-5 text-stone-500">{alert.detail} · {alert.date}</p></button>) : <div className="grid min-h-44 place-items-center px-4 text-center"><div><Bell className="mx-auto text-brand-500" size={24}/><p className="mt-3 text-sm font-semibold text-ink">No tienes avisos pendientes.</p></div></div>}
      </div>
    </section>
  </>,document.body):null

  return <div className="min-h-dvh bg-cream md:flex">
    <aside className={`app-sidebar hidden h-dvh flex-col border-r border-orange-100 bg-white text-ink md:sticky md:top-0 md:flex ${collapsed ? 'md:w-[88px]' : 'md:w-[276px]'} transition-[width] duration-300`}>
      <div className={`flex h-20 items-center border-b border-orange-100 ${collapsed ? 'justify-center px-2' : 'justify-between px-5'}`}><Brand compact={collapsed}/></div>
      <nav className="flex-1 overflow-y-auto p-3" aria-label="Navegación principal">
        {desktopNav.map(({ to, label, icon: Icon, end }) => <NavLink
          key={to}
          to={to}
          end={end}
          title={collapsed ? label : undefined}
          className={({ isActive }) => `sidebar-link mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'sidebar-link-active bg-brand-500 text-white shadow-md shadow-orange-200' : 'text-stone-600 hover:bg-brand-50 hover:text-brand-700'} ${collapsed ? 'justify-center' : ''}`}
        ><Icon size={20}/><span className={collapsed ? 'hidden' : ''}>{label}</span></NavLink>)}
      </nav>
      <button className="sidebar-collapse m-3 flex size-11 items-center justify-center self-center rounded-xl border border-orange-100 text-stone-600 hover:bg-brand-50" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}>{collapsed ? <ChevronRight/> : <ChevronLeft/>}</button>
    </aside>

    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-20 flex min-h-18 items-center gap-3 border-b border-orange-100 bg-white/95 px-4 backdrop-blur-xl sm:px-6 md:min-h-20 md:px-8">
        <NavLink to="/app/calendario" className={({ isActive }) => `mobile-calendar-shortcut md:hidden ${isActive ? 'mobile-calendar-shortcut-active' : ''}`} aria-label="Abrir calendario"><CalendarDays size={20}/></NavLink>
        <button className="icon-btn hidden shrink-0 md:inline-flex" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Expandir menú' : 'Alternar menú'} aria-expanded={!collapsed}><Menu/></button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-600 sm:text-xs">Monkey Rentals</p>
          <p className="truncate font-display text-base font-bold text-ink sm:text-lg">{current}</p>
        </div>
        <div className="relative hidden max-w-sm flex-1 md:block">
          <label className="relative block"><span className="sr-only">Buscar en toda la app</span><input className="field bg-brand-50/40 pr-11" value={search} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} onChange={event => setSearch(event.target.value)} placeholder="Buscar vehículo, cliente o alquiler..."/>{!searchFocused && !search && <Search className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-500" size={18}/>}</label>
          {search && <div className="card absolute inset-x-0 top-14 max-h-80 overflow-y-auto p-2">{results.length ? results.map(result => <button key={`${result.to}-${result.id}`} onMouseDown={event => event.preventDefault()} onClick={() => go(result.to)} className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-brand-50"><span className="block text-sm font-bold text-ink">{result.title}</span><span className="block text-xs text-stone-500">{result.detail}</span></button>) : <p className="p-4 text-center text-sm text-stone-500">No se encontraron resultados.</p>}</div>}
        </div>
        <div ref={noticesRef} className="relative">
          <button className="icon-btn relative" onClick={() => setNotices(value => !value)} aria-label={`${alerts.length} alertas`} aria-expanded={notices}><Bell size={20}/>{alerts.length > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-red-500 ring-2 ring-white"/>}</button>
        </div>
        {remoteEnabled && <div className="hidden items-center gap-2 md:flex">
          <button className={`sync-pill sync-pill-${syncStatus}`} onClick={syncStatus==='offline'||syncStatus==='error'?()=>void retrySync():undefined} title={syncError || authEmail || 'Sincronización remota'}>
            {syncLabel}
          </button>
          <button className="text-xs font-bold text-stone-500 hover:text-brand-600" onClick={signOut}>Salir</button>
        </div>}
      </header>
      <main id="main-content" className="p-4 pb-32 sm:p-6 sm:pb-32 md:p-8"><Outlet/></main>
    </div>

    {moreOpen && <><button className="fixed inset-0 z-50 bg-stone-950/45 backdrop-blur-[2px] md:hidden" onClick={() => setMoreOpen(false)} aria-label="Cerrar más opciones"/><section className="mobile-more-sheet md:hidden" aria-label="Más secciones"><div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/25"/><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-brand-500">Monkey Rentals</p><h2 className="mt-1 font-display text-xl font-extrabold text-white">Más secciones</h2></div><button className="mobile-sheet-close" onClick={() => setMoreOpen(false)} aria-label="Cerrar"><X size={20}/></button></div><nav className="mt-5 grid grid-cols-2 gap-2" aria-label="Navegación secundaria">{secondaryNav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMoreOpen(false)} className={({ isActive }) => `mobile-more-link ${isActive ? 'mobile-more-link-active' : ''}`}><Icon size={21}/><span>{label}</span></NavLink>)}</nav></section></>}

    <nav className="mobile-bottom-nav md:hidden" aria-label="Navegación móvil">
      {primaryNav.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav-link ${isActive ? 'mobile-nav-link-active' : ''}`}><Icon size={21}/><span>{label}</span></NavLink>)}
      <button className={`mobile-nav-link ${secondaryActive || moreOpen ? 'mobile-nav-link-active' : ''}`} onClick={() => setMoreOpen(value => !value)} aria-label="Más secciones" aria-expanded={moreOpen}><MoreHorizontal size={22}/><span>Más</span></button>
    </nav>
    {notificationLayer}
  </div>
}
