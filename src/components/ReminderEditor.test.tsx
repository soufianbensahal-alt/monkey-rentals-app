import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { ReminderEditor } from './ReminderEditor'
import { emptyState } from '../data/emptyState'
const mocks=vi.hoisted(()=>({upsert:vi.fn(),remove:vi.fn()}))
vi.mock('../store/FleetContext',()=>({useFleet:()=>({state:emptyState,upsert:mocks.upsert,remove:mocks.remove,syncStatus:'online'})}))
beforeEach(()=>vi.clearAllMocks())
it('crea Otro sin cliente ni vehículo, sin avisos ni repetición',()=>{
  const close=vi.fn()
  render(<ReminderEditor date="2026-09-25" onClose={close}/>)
  expect(screen.queryByText('Avisarme')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Repetir alerta')).not.toBeInTheDocument()
  expect(screen.getByLabelText('Prioridad')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Título'),{target:{value:'Llamar al gestor'}})
  fireEvent.change(screen.getByLabelText('Hora del evento'),{target:{value:'11:30'}})
  fireEvent.click(screen.getByRole('button',{name:'Guardar alerta'}))
  expect(mocks.upsert).toHaveBeenCalledWith('events',expect.objectContaining({title:'Llamar al gestor',type:'otro',date:'2026-09-25',time:'11:30',priority:'media',revision:expect.any(String)}))
  expect(mocks.upsert.mock.calls[0][1].customerId).toBeUndefined()
  expect(mocks.upsert.mock.calls[0][1].reminders).toBeUndefined()
  expect(mocks.upsert.mock.calls[0][1].recurrence).toBeUndefined()
  expect(close).toHaveBeenCalled()
})
it('al editar una alerta antigua descarta sus avisos y repetición guardados',()=>{
  const old={id:'e1',title:'ITV',date:'2026-09-25',time:'10:00',type:'itv' as const,priority:'alta' as const,reminders:[{value:1,unit:'days' as const}],recurrence:{unit:'months' as const,interval:1}}
  render(<ReminderEditor event={old} date={old.date} onClose={vi.fn()}/>)
  fireEvent.click(screen.getByRole('button',{name:'Guardar alerta'}))
  expect(mocks.upsert.mock.calls[0][1]).toMatchObject({id:'e1',priority:'alta',reminders:undefined,recurrence:undefined})
})
