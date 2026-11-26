import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { FleetProvider, STORAGE_KEY } from '../store/FleetContext'
import { emptyState } from '../data/emptyState'
import type { FleetState, Vehicle } from '../types'
import FleetPage from './FleetPage'
import DashboardPage from './DashboardPage'
import RentalsPage from './RentalsPage'

const van = (id: string, plate: string, brand: string, model: string): Vehicle => ({ id, plate, brand, model, category: 'Furgoneta', year: 2022, dailyRate: 30, weeklyRate: 180, monthlyRate: 600, includedKmPerDay: 125, extraKmRate: 0.15, status: 'disponible', notes: '' })
function initial(): FleetState {
  return { ...structuredClone(emptyState),
    vehicles: [van('v1', '1111AAA', 'Fiat', 'Dobló'), van('v2', '2222BBB', 'Renault', 'Kangoo')],
    customers: [{ id: 'c1', name: 'Juan Pérez', email: '', phone: '', dni: '', rentals: 0 }],
    rentals: [
      { id: 'r1', vehicleId: 'v1', customerId: 'c1', startDate: '2026-01-01', agreedPrice: 600, pricePeriod: 'mes', expectedKilometers: 0, status: 'activo', notes: '' },
      { id: 'r2', vehicleId: 'v2', customerId: 'c1', startDate: '2026-02-01', endDate: '2026-02-28', agreedPrice: 600, pricePeriod: 'mes', expectedKilometers: 0, status: 'finalizado', notes: '' },
    ],
    payments: [{ id: 'p2', rentalId: 'r2', dueDate: '2026-02-01', paidDate: '2026-02-01', amount: 600, status: 'pagado', notes: '' }],
    maintenance: [{ id: 'm2', vehicleId: 'v2', date: '2026-02-10', type: 'Revisión', cost: 80, status: 'completado', notes: '' }],
    events: [
      { id: 'e-only-vehicle', title: 'Renovar seguro', date: '2026-12-01', type: 'otro', vehicleId: 'v2' },
      { id: 'e-rental', title: 'Reclamar daños', date: '2026-12-01', type: 'pago', vehicleId: 'v2', rentalId: 'r2', customerId: 'c1' },
    ],
  }
}
const cached = (): FleetState => JSON.parse(localStorage.getItem(STORAGE_KEY)!)
const show = (page: React.ReactNode, path = '/app/flota') => { cleanup(); render(<MemoryRouter initialEntries={[path]}><FleetProvider>{page}</FleetProvider></MemoryRouter>) }
const table = () => screen.getByRole('table')

describe('Baja de vehículos en Flota', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(initial())) })

  it('el modal de edición tiene las acciones en un pie fijo fuera del scroll y bloquea el fondo', async () => {
    show(<FleetPage/>)
    fireEvent.click(screen.getByRole('button', { name: 'Editar 2222BBB' }))
    const dialog = screen.getByRole('dialog')
    const body = dialog.querySelector('.modal-body')!, footer = dialog.querySelector('.modal-footer')!
    expect(document.body.style.overflow).toBe('hidden')
    for (const name of ['Dar de baja', 'Cancelar', 'Guardar vehículo']) {
      const button = within(dialog).getByRole('button', { name: new RegExp(name) })
      expect(footer).toContainElement(button)
      expect(body).not.toContainElement(button)
    }
    expect(body).toContainElement(within(dialog).getByLabelText(/Notas internas/))
    fireEvent.change(within(dialog).getByLabelText(/Notas internas/), { target: { value: 'Guardado desde el pie' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar vehículo' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cached().vehicles.find(v => v.id === 'v2')?.notes).toBe('Guardado desde el pie')
    expect(document.body.style.overflow).toBe('')
  })

  it('no deja dar de baja un vehículo con un alquiler en curso y lista los alquileres afectados', () => {
    show(<FleetPage/>)
    fireEvent.click(screen.getByRole('button', { name: 'Dar de baja 1111AAA' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('No se puede dar de baja')
    expect(within(dialog).getByRole('link', { name: /Juan Pérez/ })).toHaveAttribute('href', '/app/alquileres?edit=r1')
    expect(within(dialog).queryByRole('button', { name: 'Dar de baja' })).not.toBeInTheDocument()
  })

  it('da de baja, lo oculta del uso diario, conserva el historial con badge y lo reactiva', async () => {
    show(<FleetPage/>)
    fireEvent.click(screen.getByRole('button', { name: 'Dar de baja 2222BBB' }))
    let dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: 'otro' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dar de baja' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Explica el motivo en las notas cuando eliges «Otro».')
    expect(within(dialog).getByRole('alert')).toHaveClass('bg-red-50', 'text-red-700')
    expect(cached().vehicles.find(v => v.id === 'v2')?.estado).toBeUndefined()
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: 'venta' } })
    fireEvent.change(within(dialog).getByLabelText(/Comprador/), { target: { value: 'Taller Sur' } })
    expect(dialog).toHaveTextContent('dejará de aparecer en la flota, pero se conservará su historial')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dar de baja' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    expect(cached().vehicles.find(v => v.id === 'v2')).toMatchObject({ estado: 'baja', baja: { motivo: 'venta', comprador: 'Taller Sur' } })
    expect(cached().rentals).toHaveLength(2)
    expect(within(table()).queryByText('2222BBB', { exact: false })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Archivados \(1\)/ }))
    expect(within(table()).getByText(/2222BBB/)).toBeInTheDocument()
    expect(within(table()).getAllByText('De baja')[0]).toHaveClass('badge-retired', 'vehicle-state-badge')
    expect(within(table()).getAllByText(/^Venta · \d{2}\/\d{2}\/\d{4}$/).length).toBeGreaterThan(0)

    show(<DashboardPage/>, '/app')
    expect(screen.getByText('0 / 1')).toBeInTheDocument()

    show(<RentalsPage/>, '/app/alquileres')
    expect(screen.getAllByText('De baja · Venta').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Crear alquiler/ }))
    const options = within(screen.getByLabelText(/Vehículo/)).getAllByRole('option').map(option => option.textContent)
    expect(options).toEqual(['Fiat Dobló · 1111AAA'])

    show(<FleetPage/>)
    fireEvent.click(screen.getByRole('tab', { name: /Archivados/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver ficha de 2222BBB' }))
    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Historial de estados')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /Reactivar vehículo/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirmar reactivación/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cached().vehicles.find(v => v.id === 'v2')?.estado).toBe('activo')
    expect(cached().vehicles.find(v => v.id === 'v2')?.estadoHistorial?.map(change => change.estadoNuevo)).toEqual(['baja', 'activo'])
    fireEvent.click(screen.getByRole('tab', { name: /Activos \(2\)/ }))
    expect(within(table()).getByText(/2222BBB/)).toBeInTheDocument()
  })

  it('eliminar muestra qué se borra y qué se conserva, recomienda archivar y conserva el historial', async () => {
    show(<FleetPage/>)
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar 2222BBB' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Se borra')
    expect(dialog).toHaveTextContent('1 mantenimiento')
    expect(dialog).toHaveTextContent('Se conserva')
    expect(dialog).toHaveTextContent('1 alquiler')
    expect(dialog).toHaveTextContent('1 pago de esos alquileres')
    expect(dialog).toHaveTextContent('1 recordatorio del vehículo, mantenimiento o documento')
    expect(dialog).toHaveTextContent('1 recordatorio vinculado a un alquiler')
    expect(within(dialog).getByRole('button', { name: /Archivar en su lugar/ })).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: /Eliminar definitivamente/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cached().vehicles.map(v => v.id)).toEqual(['v1'])
    expect(cached().rentals.find(r => r.id === 'r2')?.vehicleSnapshot).toMatchObject({ plate: '2222BBB', label: 'Renault Kangoo' })
    expect(cached().payments).toHaveLength(1)
    expect(cached().maintenance).toHaveLength(0)
    expect(cached().events.map(e => e.id)).toEqual(['e-rental'])
    expect(cached().events[0].vehicleSnapshot).toMatchObject({ plate: '2222BBB', label: 'Renault Kangoo' })

    show(<RentalsPage/>, '/app/alquileres')
    expect(screen.getByText('Renault Kangoo')).toBeInTheDocument()
    expect(screen.getByText('Eliminado')).toBeInTheDocument()
  })
})
