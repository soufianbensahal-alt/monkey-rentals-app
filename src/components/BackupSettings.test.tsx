import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { BackupSettings, BackupReminder } from './BackupSettings'
import { createBackup } from '../lib/backups'
import { emptyState } from '../data/emptyState'
const mock=vi.hoisted(()=>({ownerId:'user-a' as string|null,restore:vi.fn()}))
vi.mock('../store/FleetContext',()=>({useFleet:()=>({state:emptyState,ownerId:mock.ownerId,syncStatus:'online',restoreFromBackup:mock.restore})}))
beforeEach(()=>{localStorage.clear();mock.ownerId='user-a';mock.restore.mockReset()})
it('exige revisar y confirmar antes de restaurar',async()=>{
  render(<BackupSettings/>)
  const json=JSON.stringify(createBackup(emptyState,'user-a'))
  fireEvent.change(screen.getByLabelText('Seleccionar copia de seguridad'),{target:{files:[{size:json.length,text:async()=>json}]}})
  const restore=await screen.findByRole('button',{name:'Restaurar copia'})
  expect(restore).toBeDisabled();expect(mock.restore).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.change(screen.getByLabelText('Modo de restauración'),{target:{value:'replace'}})
  expect(restore).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(restore)
  expect(mock.restore).toHaveBeenCalledWith(json,'replace')
})
it('rechaza archivos de otra cuenta sin abrir la confirmación',async()=>{
  render(<BackupSettings/>)
  const json=JSON.stringify(createBackup(emptyState,'user-b'))
  fireEvent.change(screen.getByLabelText('Seleccionar copia de seguridad'),{target:{files:[{size:json.length,text:async()=>json}]}})
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('otra cuenta'))
  expect(mock.restore).not.toHaveBeenCalled()
  expect(screen.queryByRole('checkbox')).toBeNull()
})
it('muestra avisos vencidos solo para la cuenta actual',()=>{
  localStorage.setItem('monkey-backups:user-a',JSON.stringify({frequency:'weekly',enabledAt:'2020-01-01',history:[]}))
  const view=render(<BackupReminder/>)
  expect(screen.getByText('Hoy toca crear una copia de seguridad')).toBeInTheDocument()
  view.unmount();mock.ownerId='user-b';render(<BackupReminder/>)
  expect(screen.queryByText('Hoy toca crear una copia de seguridad')).toBeNull()
})
