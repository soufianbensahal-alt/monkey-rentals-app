import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { FleetProvider, STORAGE_KEY } from '../store/FleetContext'
import { emptyState } from '../data/emptyState'
import type { FleetState } from '../types'
import RentalsPage from './RentalsPage'

function initial(): FleetState {
  return { ...structuredClone(emptyState),
    vehicles:[{id:'v1',brand:'Fiat',model:'Dobló',plate:'1234ABC',category:'Furgoneta',year:2022,dailyRate:30,weeklyRate:180,monthlyRate:600,includedKmPerDay:125,extraKmRate:0.15,status:'disponible',notes:''}],
    customers:[{id:'c1',name:'Juan Pérez',email:'',phone:'',dni:'',rentals:0}],
    rentals:[{id:'r1',vehicleId:'v1',customerId:'c1',startDate:'2026-09-01',endDate:'2026-09-05',agreedPrice:120,pricePeriod:'dia',durationDays:4,expectedKilometers:0,status:'activo',notes:'',kmStart:125400}],
  }
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), {target:{value}})
const cached = (): FleetState => JSON.parse(localStorage.getItem(STORAGE_KEY)!)
function open(state = initial()) {
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state))
  render(<MemoryRouter initialEntries={['/app/alquileres?edit=r1']}><FleetProvider><RentalsPage/></FleetProvider></MemoryRouter>)
}

describe('Formulario de kilometraje y cierre', () => {
  beforeEach(() => localStorage.clear())
  it('previsualiza el ejemplo completo y solo crea el cargo tras marcar la revisión', async () => {
    open()
    change('Km finales del vehículo','126050')
    change('Estado','finalizado')
    fireEvent.click(screen.getByLabelText('Calcular kilómetros extra'))
    expect(screen.getByText(/Total por km extra:.*27,23/)).toBeInTheDocument()
    const charge = screen.getByRole('checkbox', {name:/Crear pago pendiente por/})
    expect(charge).not.toBeChecked()
    fireEvent.click(charge)
    fireEvent.click(screen.getByRole('button',{name:'Guardar alquiler'}))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cached().rentals[0]).toMatchObject({kmUsed:650,kmIncludedTotal:500,kmExtraUsed:150,kmExtraTotalAmount:27.23})
    expect(cached().payments).toHaveLength(1)
    expect(cached().vehicles[0].currentKm).toBe(126050)
  })
  it('guarda kilómetros sin generar pagos y deja cerrar con un aviso si faltan los finales', async () => {
    open()
    change('Estado','finalizado')
    expect(screen.getByText(/Faltan km finales. Puedes guardarlo/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Guardar alquiler'}))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(cached().rentals[0].kmEnd).toBeUndefined()
    expect(cached().payments).toHaveLength(0)
  })
  it('rechaza una lectura final inferior a la inicial', async () => {
    open()
    change('Km finales del vehículo','125399')
    fireEvent.click(screen.getByRole('button',{name:'Guardar alquiler'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Los km finales no pueden ser inferiores')
    expect(cached().rentals[0].kmEnd).toBeUndefined()
  })
  it('permite acuerdos semanales, mensuales y personalizados sin perder el precio manual', () => {
    open()
    change('Número de días *','6')
    expect(screen.getByText('750 km incluidos')).toBeInTheDocument()
    change('Tipo de alquiler *','semana')
    expect(screen.getByLabelText('Km incluidos por semana')).toHaveValue(875)
    change('Km incluidos por semana','500')
    change('Número de semanas pactadas','2')
    expect(screen.getByText('1000 km incluidos')).toBeInTheDocument()
    change('Tipo de alquiler *','mes')
    change('Km incluidos por mes','3000')
    change('Número de meses pactados','2')
    expect(screen.getByText('6000 km incluidos')).toBeInTheDocument()
    change('Tipo de alquiler *','otro')
    change('Km incluidos en el alquiler','900')
    expect(screen.getByLabelText('Precio acordado (€) *')).toHaveValue(120)
    expect(screen.getByLabelText('Km incluidos en el alquiler')).toHaveValue(900)
  })
})
