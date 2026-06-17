export type Priority = 'alta' | 'media' | 'baja'
export type VehicleStatus = 'disponible' | 'alquilado' | 'mantenimiento' | 'reservado'
export type RentalStatus = 'activo' | 'finalizado' | 'pendiente' | 'cancelado'
export type PaymentStatus = 'pendiente' | 'pagado' | 'atrasado' | 'flexible'
export type PricePeriod = 'dia' | 'semana' | 'mes' | 'otro'

export interface Vehicle {
  id: string
  name?: string
  plate: string
  category: string
  brand: string
  model: string
  year: number
  dailyRate: number
  weeklyRate: number
  monthlyRate: number
  includedKmPerDay: number
  extraKmRate: number
  status: VehicleStatus
  image?: string
  notes: string
}

export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  dni: string
  company?: string
  rentals: number
}

export interface Rental {
  id: string
  vehicleId: string
  customerId: string
  startDate: string
  endDate?: string
  agreedPrice: number
  pricePeriod: PricePeriod
  durationDays?: number
  expectedKilometers: number
  nextPaymentDate?: string
  status: RentalStatus
  notes: string
}

export interface Payment {
  id: string
  rentalId: string
  dueDate: string
  paidDate?: string
  amount: number
  status: PaymentStatus
  method?: string
  notes: string
}

export interface Task { id: string; title: string; dueDate: string; priority: Priority; completed: boolean; category: string }
export interface MaintenanceRecord { id: string; vehicleId: string; type: string; date: string; cost: number; status: 'programado' | 'en curso' | 'completado'; notes: string }
export interface Document { id: string; vehicleId: string; type: string; expiryDate: string; cost?: number; paymentStatus?: 'pendiente' | 'pagado'; paidDate?: string; notes: string }
export interface VehicleTax { id: string; vehicleId: string; concept: string; dueDate: string; amount: number; status: 'pendiente' | 'pagado'; paidDate?: string; notes: string }
export interface Fine { id: string; vehicleId: string; customerId?: string; rentalId?: string; infractionDate: string; dueDate?: string; amount: number; status: 'pendiente' | 'pagada' | 'reclamada' | 'cargada al cliente' | 'archivada'; concept: string; notes: string }
export interface CalendarEvent { id: string; title: string; date: string; type: 'entrega' | 'devolución' | 'itv' | 'mantenimiento' | 'reserva' }
export interface AdminSettings { name: string; company: string; email: string; phone: string }

export interface FleetState {
  version: 4
  vehicles: Vehicle[]
  customers: Customer[]
  rentals: Rental[]
  payments: Payment[]
  tasks: Task[]
  maintenance: MaintenanceRecord[]
  documents: Document[]
  taxes: VehicleTax[]
  fines: Fine[]
  events: CalendarEvent[]
  adminSettings: AdminSettings
}
