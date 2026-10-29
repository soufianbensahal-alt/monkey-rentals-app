import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { emptyState } from '../data/emptyState'
import { blankExpense } from '../lib/expenses'
import { ExpenseEditor } from './ExpenseEditor'

const mocks = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('../lib/expenses', async original => ({ ...await original<typeof import('../lib/expenses')>(), saveExpense: mocks.save }))
vi.mock('../store/FleetContext', () => ({ useFleet: () => ({ state: { ...emptyState, vehicles: [{ id: 'v1', plate: '1234ABC', brand: 'Fiat', model: 'Dobló' }] } }) }))
beforeEach(() => { mocks.save.mockReset(); mocks.save.mockResolvedValue({}) })

it('guarda como genérico si no se vincula a un vehículo', async () => {
  const close = vi.fn()
  render(<ExpenseEditor expense={blankExpense()} onClose={close}/>)
  fireEvent.change(screen.getByLabelText('Importe (€) *'), { target: { value: '25.5' } })
  fireEvent.change(screen.getByLabelText('Categoría *'), { target: { value: 'combustible' } })
  fireEvent.change(screen.getByLabelText('Litros (opcional)'), { target: { value: '30' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }))
  await waitFor(() => expect(close).toHaveBeenCalled())
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ amount: 25.5, category: 'combustible', liters: 30, vehicleId: undefined }), { file: null, removeAttachment: false })
})

it('exige vehículo al activar «Vincular a vehículo» y lo guarda vinculado', async () => {
  render(<ExpenseEditor expense={blankExpense()} onClose={vi.fn()}/>)
  fireEvent.change(screen.getByLabelText('Importe (€) *'), { target: { value: '10' } })
  fireEvent.click(screen.getByLabelText('Vincular a vehículo'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona el vehículo')
  expect(mocks.save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Vehículo *'), { target: { value: 'v1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar gasto' }))
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: 'v1' }), expect.anything()))
})

it('muestra el subtipo solo para desplazamientos y trámites', () => {
  render(<ExpenseEditor expense={blankExpense()} onClose={vi.fn()}/>)
  expect(screen.queryByLabelText('Tipo de desplazamiento')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Categoría *'), { target: { value: 'desplazamientos' } })
  expect(screen.getByLabelText('Tipo de desplazamiento')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Categoría *'), { target: { value: 'tramites' } })
  expect(screen.getByLabelText('Tipo de trámite')).toBeInTheDocument()
})
