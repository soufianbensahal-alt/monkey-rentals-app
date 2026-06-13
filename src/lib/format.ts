export const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
export const number = new Intl.NumberFormat('es-ES')
export const date = (value?: string) => value ? new Intl.DateTimeFormat('es-ES', { day:'2-digit', month:'short', year:'numeric' }).format(new Date(`${value}T12:00:00`)) : 'Sin fecha'
export const shortDate = (value: string) => new Intl.DateTimeFormat('es-ES', { day:'2-digit', month:'short' }).format(new Date(`${value}T12:00:00`))
export const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
