export type Priority = 'alta' | 'media' | 'baja'
export type VehicleStatus = 'disponible' | 'alquilado' | 'mantenimiento' | 'reservado'
export type RentalStatus = 'activo' | 'finalizado' | 'pendiente' | 'cancelado'
export type PaymentStatus = 'pendiente' | 'pagado' | 'atrasado' | 'flexible' | 'cancelado'
export type PricePeriod = 'dia' | 'semana' | 'mes' | 'otro'
export type PaymentType = 'normal' | 'flexible' | 'fianza' | 'penalizacion' | 'km_extra' | 'multa' | 'otro'
export type ReminderFrequency = 'none' | 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom'
export type RecurrenceType = 'unico' | 'recurrente'
export type ClientDocumentType = 'DNI / NIE' | 'Pasaporte' | 'Carnet de conducir' | 'Contrato firmado' | 'Justificante' | 'Otro'

// Logical lifecycle of a vehicle. A missing value means 'activo' so older data keeps working.
export type VehicleLifecycleState = 'activo' | 'baja'
export type VehicleRetirementReason = 'venta' | 'siniestro_total' | 'robo' | 'fin_renting' | 'desguace' | 'traspaso' | 'otro'

export interface VehicleRetirement {
  motivo: VehicleRetirementReason
  fecha: string
  notas: string
  registradaPor?: string
  registradaAt: string
  precioVenta?: number
  comprador?: string
  numeroSiniestro?: string
  aseguradora?: string
}

export interface VehicleStateChange {
  id: string
  estadoAnterior: VehicleLifecycleState
  estadoNuevo: VehicleLifecycleState
  motivo?: VehicleRetirementReason
  fechaBaja?: string
  notas: string
  usuario?: string
  fecha: string
}

// Fixed copy of a deleted vehicle kept on the records that survive its deletion.
export interface VehicleSnapshot {
  plate: string
  brand: string
  model: string
  label: string
  deletedAt: string
}

export interface Vehicle {
  estado?: VehicleLifecycleState
  baja?: VehicleRetirement
  estadoHistorial?: VehicleStateChange[]
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
  currentKm?: number
  lastKmUpdate?: string
  status: VehicleStatus
  image?: string
  imagePath?: string
  imageThumbnailPath?: string
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

export interface RentalMileage {
  mileageAlertDismissed?: boolean
  kmStart?: number
  kmEnd?: number
  kmUsed?: number
  kmIncludedTotal?: number
  kmIncludedUnit?: 'total' | 'dia' | 'semana' | 'mes'
  kmIncludedPerUnit?: number
  kmIncludedPeriods?: number
  kmExtraEnabled?: boolean
  kmExtraPrice?: number
  kmExtraDefaultPrice?: number
  kmExtraVatRate?: number
  kmExtraUsed?: number
  kmExtraBaseAmount?: number
  kmExtraVatAmount?: number
  kmExtraTotalAmount?: number
  kmExtraPaymentId?: string
  returnCondition?: string
  returnNotes?: string
}

export interface Rental extends RentalMileage {
  id: string
  vehicleId: string
  vehicleSnapshot?: VehicleSnapshot
  customerId: string
  startDate: string
  endDate?: string
  agreedPrice: number
  pricePeriod: PricePeriod
  durationDays?: number
  expectedKilometers: number
  nextPaymentDate?: string
  nextPaymentAmount?: number
  paymentReminderFrequency?: ReminderFrequency
  paymentRecurrenceType?: RecurrenceType
  status: RentalStatus
  notes: string
  documents?: RentalDocument[]
}

export interface Payment {
  id: string
  rentalId: string
  dueDate: string
  paidDate?: string
  amount: number
  status: PaymentStatus
  type?: PaymentType
  kmExtraRelated?: number
  kmExtraPrice?: number
  kmExtraVatRate?: number
  kmExtraBaseAmount?: number
  kmExtraVatAmount?: number
  mileageCharge?: boolean
  reminderEnabled?: boolean
  reminderDate?: string
  reminderFrequency?: ReminderFrequency
  recurrenceType?: RecurrenceType
  recurrenceInterval?: number
  isFlexible?: boolean
  flexibleNotes?: string
  method?: string
  notes: string
}

export interface ClientDocument {
  id: string
  customerId: string
  type: ClientDocumentType
  fileName: string
  mimeType: string
  size: number
  uploadedAt: string
  dataUrl: string
  path?: string
  thumbnailPath?: string
  kind?: PrivateFileKind
  notes: string
}

export interface Task { id: string; title: string; dueDate: string; priority: Priority; completed: boolean; category: string }
export interface MaterialPhoto { id:string; path:string; thumbnailPath:string; size:number; mimeType:string }
export type PrivateFileKind = 'image' | 'pdf'
export interface PrivateFile {
  id:string
  fileName:string
  path:string
  thumbnailPath?:string
  size:number
  mimeType:string
  kind:PrivateFileKind
  uploadedAt:string
}
export type MaintenanceFile = PrivateFile
export type RentalDocumentType = 'signed_contract' | 'delivery_document' | 'return_document' | 'other'
export interface RentalDocument extends PrivateFile { documentType:RentalDocumentType }
export interface MaintenanceMaterial { id:string; name:string; category:string; quantity:number; unitPrice:number; supplier?:string; reference?:string; purchaseDate:string; notes:string; photos:MaterialPhoto[] }
export interface ClientDebt { id:string; customerId:string; customerName:string; originalAmount:number; date:string; dueDate?:string; reason:string; rentalId?:string; vehicleId?:string; vehicleSnapshot?:VehicleSnapshot; cancelled?:boolean; notes:string; createdAt:string; updatedAt:string }
export interface DebtPayment { id:string; debtId:string; customerId:string; amount:number; date:string; method:string; reference?:string; notes:string; createdAt:string }
export interface MaintenanceRecord { laborCost?:number; otherCost?:number; materials?:MaintenanceMaterial[]; attachments?:MaintenanceFile[]; id: string; vehicleId: string; type: string; date: string; cost: number; status: 'programado' | 'en curso' | 'completado'; notes: string }
export interface Document { id: string; vehicleId: string; type: string; expiryDate: string; cost?: number; paymentStatus?: 'pendiente' | 'pagado'; paidDate?: string; notes: string }
export interface VehicleTax { id: string; vehicleId: string; concept: string; dueDate: string; amount: number; status: 'pendiente' | 'pagado'; paidDate?: string; notes: string }
export interface Fine { id: string; vehicleId: string; vehicleSnapshot?: VehicleSnapshot; customerId?: string; rentalId?: string; infractionDate: string; dueDate?: string; amount: number; status: 'pendiente' | 'pagada' | 'reclamada' | 'cargada al cliente' | 'archivada'; concept: string; notes: string }
export type ReminderCategory = 'pago' | 'alquiler' | 'reserva' | 'itv' | 'mantenimiento' | 'impuesto' | 'multa' | 'documento' | 'entrega' | 'devolución' | 'otro'
export interface ReminderOffset { value:number; unit:'minutes'|'hours'|'days'|'weeks'; time?:string }
export interface ReminderRecurrence { unit:'days'|'weeks'|'months'|'years'; interval:number }
export interface CalendarEvent {
  id:string; title:string; date:string; type:ReminderCategory
  description?:string; time?:string; timezone?:string; reminders?:ReminderOffset[]
  recurrence?:ReminderRecurrence; priority?:Priority; notes?:string
  status?:'active'|'completed'|'cancelled'; revision?:string; createdAt?:string; updatedAt?:string
  debtId?:string; documentId?:string; customerId?:string; vehicleId?:string; vehicleSnapshot?:VehicleSnapshot; rentalId?:string; paymentId?:string; maintenanceId?:string
}
export interface NotificationSettings { enabled:boolean; categories:ReminderCategory[]; timezone:string }
export interface AdminSettings { notifications?:NotificationSettings; name: string; company: string; email: string; phone: string }

export interface FleetState {
  debts?: ClientDebt[]
  debtPayments?: DebtPayment[]
  version: 4
  vehicles: Vehicle[]
  customers: Customer[]
  rentals: Rental[]
  payments: Payment[]
  clientDocuments: ClientDocument[]
  tasks: Task[]
  maintenance: MaintenanceRecord[]
  documents: Document[]
  taxes: VehicleTax[]
  fines: Fine[]
  events: CalendarEvent[]
  adminSettings: AdminSettings
}
