import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { ReminderEditor } from './ReminderEditor'
import { emptyState } from '../data/emptyState'
const mocks=vi.hoisted(()=>({upsert:vi.fn(),remove:vi.fn()}))
vi.mock('../store/FleetContext',()=>({useFleet:()=>({state:emptyState,upsert:mocks.upsert,remove:mocks.remove,syncStatus:'online'})}))
beforeEach(()=>vi.clearAllMocks())
it('crea Otro sin cliente ni vehículo con fecha, hora y aviso explícitos',()=>{
  const close=vi.fn()
  render(<ReminderEditor date="2026-09-25" onClose={close}/>)
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Llamar al gestor'}})
  fireEvent.change(screen.getByLabelText('Hora del evento'),{target:{value:'11:30'}})
  fireEvent.change(screen.getByLabelText('Aviso 1'),{target:{value:'30'}})
  fireEvent.click(screen.getByRole('button',{name:'Guardar alerta'}))
  expect(mocks.upsert).toHaveBeenCalledWith('events',expect.objectContaining({title:'Llamar al gestor',type:'otro',date:'2026-09-25',time:'11:30',reminders:[{value:30,unit:'minutes',time:undefined}],revision:expect.any(String)}))
  expect(mocks.upsert.mock.calls[0][1].customerId).toBeUndefined()
  expect(mocks.upsert.mock.calls[0][1].recurrence).toBeUndefined()
  expect(close).toHaveBeenCalled()
})
it('no guarda antelaciones duplicadas',()=>{
  render(<ReminderEditor date="2026-09-25" onClose={vi.fn()}/>)
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'ITV'}})
  fireEvent.click(screen.getByRole('button',{name:'Añadir otro aviso'}))
  fireEvent.change(screen.getByLabelText('Aviso 2'),{target:{value:'0'}})
  fireEvent.click(screen.getByRole('button',{name:'Guardar alerta'}))
  expect(screen.getByRole('alert')).toHaveTextContent('dos avisos')
  expect(mocks.upsert).not.toHaveBeenCalled()
})
