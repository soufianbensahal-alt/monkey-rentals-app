import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyState } from '../data/emptyState'
import ReportsPage from './ReportsPage'

const mocks = vi.hoisted(() => ({ download: vi.fn(), syncStatus: 'synced' }))
vi.mock('../lib/reportExcel', () => ({ downloadReportExcel: mocks.download }))
vi.mock('../store/FleetContext', () => ({ useFleet: () => ({ state:emptyState, authEmail:'owner@example.test', syncStatus:mocks.syncStatus }) }))

describe('Exportar Excel desde Informes', () => {
  beforeEach(() => { mocks.download.mockReset(); mocks.syncStatus = 'synced' })

  it('permite descargar el resumen vacío y pasa solo el estado de la sesión', async () => {
    mocks.download.mockResolvedValue(true)
    render(<ReportsPage/>)
    fireEvent.click(screen.getByRole('button', {name:'Exportar Excel'}))
    await screen.findByText('Excel generado correctamente.')
    expect(mocks.download).toHaveBeenCalledWith(emptyState, undefined, 'owner@example.test')
  })

  it('evita descargas simultáneas y permite reintentar tras un error', async () => {
    let reject!: (error: Error) => void
    mocks.download.mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise }))
    render(<ReportsPage/>)
    fireEvent.click(screen.getByRole('button', {name:'Exportar Excel'}))
    expect(screen.getByRole('button', {name:'Generando Excel…'})).toBeDisabled()
    reject(new Error('Error de descarga'))
    await screen.findByText('No se ha podido generar el Excel.')
    mocks.download.mockResolvedValue(true)
    fireEvent.click(screen.getByRole('button', {name:'Exportar Excel'}))
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(2))
    await screen.findByText('Excel generado correctamente.')
  })

  it('espera a que se carguen los datos de la cuenta', () => {
    mocks.syncStatus = 'loading'
    render(<ReportsPage/>)
    expect(screen.getByRole('button', {name:'Exportar Excel'})).toBeDisabled()
    expect(mocks.download).not.toHaveBeenCalled()
  })
})
