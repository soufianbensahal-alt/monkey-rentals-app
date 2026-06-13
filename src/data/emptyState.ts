import type { FleetState } from '../types'

export const emptyState: FleetState = {
  version: 4,
  vehicles: [],
  customers: [],
  rentals: [],
  payments: [],
  tasks: [],
  maintenance: [],
  documents: [],
  taxes: [],
  fines: [],
  events: [],
  adminSettings: {
    name: 'Jonathan',
    company: 'Monkey Rentals',
    email: '',
    phone: '',
  },
}
