import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyState } from '../data/emptyState'
import type { FleetState, Rental } from '../types'
import { MileageOverview } from './MileageOverview'

const dismiss = vi.hoisted(() => vi.fn())
vi.mock('../store/FleetContext', () => ({ useFleet: () => ({ dismissMileageAlert: dismiss }) }))

const rental = (id: string, customerId: string, extra: Partial<Rental> = {}) => ({ id, vehicleId:'v1', customerId, startDate:'2026-09-01', endDate:'2026-09-10', agreedPrice:100, status:'finalizado', ...extra }) as Rental
const stateWith = (rentals: Rental[]): FleetState => ({ ...structuredClone(emptyState), vehicles:[{ id:'v1', plate:'1234ABC', brand:'Renault', model:'Kangoo' } as FleetState['vehicles'][number]], customers:[{ id:'c1', name:'Felipe' }, { id:'c2', name:'Marlon' }] as FleetState['customers'], rentals })
const renderOverview = (state: FleetState, compact = false) => render(<MemoryRouter><MileageOverview state={state} compact={compact}/></MemoryRouter>)

describe('Pendientes de km en Informes', () => {
  beforeEach(() => dismiss.mockReset())

  it('muestra un resumen y abre la lista completa con sus acciones', () => {
    renderOverview(stateWith([rental('r1','c1'), rental('r2','c2'), rental('r3','c1',{ mileageAlertDismissed:true })]))
    expect(screen.getByText('2 alquileres pendientes de completar km')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name:'Completar km' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name:'Revisar' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByRole('link', { name:'Completar km' })[0]).toHaveAttribute('href', '/app/alquileres?edit=r1')
    expect(within(dialog).getByText(/Marlon/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name:/Descartar aviso de kilometraje de .*Marlon/ }))
    expect(dismiss).toHaveBeenCalledWith('r2')
  })

  it('oculta el resumen si no hay pendientes', () => {
    renderOverview(stateWith([rental('r1','c1',{ mileageAlertDismissed:true })]))
    expect(screen.queryByRole('button', { name:'Revisar' })).not.toBeInTheDocument()
  })

  it('mantiene la lista corta del panel principal', () => {
    renderOverview(stateWith([rental('r1','c1'), rental('r2','c2')]), true)
    expect(screen.queryByRole('button', { name:'Revisar' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/Completar km ·/)).toHaveLength(2)
  })
})
