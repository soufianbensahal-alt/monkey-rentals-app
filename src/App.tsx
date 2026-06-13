import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'

const Dashboard = lazy(()=>import('./pages/DashboardPage'))
const Fleet = lazy(()=>import('./pages/FleetPage'))
const Rentals = lazy(()=>import('./pages/RentalsPage'))
const Customers = lazy(()=>import('./pages/CustomersPage'))
const Tasks = lazy(()=>import('./pages/TasksPage'))
const Payments = lazy(()=>import('./pages/PaymentsPage'))
const Documentation = lazy(()=>import('./pages/DocumentationPage'))
const Calendar = lazy(()=>import('./pages/CalendarPage'))
const Module = lazy(()=>import('./pages/ModulePage'))

function Loader(){return <div className="grid min-h-dvh place-items-center bg-cream"><div className="size-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500" role="status" aria-label="Cargando"/></div>}
export function App(){return <Suspense fallback={<Loader/>}><Routes><Route path="/" element={<Navigate to="/app" replace/>}/><Route path="/app" element={<AppLayout/>}><Route index element={<Dashboard/>}/><Route path="flota" element={<Fleet/>}/><Route path="alquileres" element={<Rentals/>}/><Route path="clientes" element={<Customers/>}/><Route path="tareas" element={<Tasks/>}/><Route path="calendario" element={<Calendar/>}/><Route path="mantenimiento" element={<Module type="maintenance"/>}/><Route path="documentacion" element={<Documentation/>}/><Route path="pagos" element={<Payments/>}/><Route path="alertas" element={<Module type="alerts"/>}/><Route path="informes" element={<Module type="reports"/>}/><Route path="configuracion" element={<Module type="settings"/>}/></Route><Route path="*" element={<Navigate to="/app" replace/>}/></Routes></Suspense>}
