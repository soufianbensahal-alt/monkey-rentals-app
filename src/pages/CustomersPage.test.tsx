import { render, screen } from '@testing-library/react'
import { FleetProvider, STORAGE_KEY } from '../store/FleetContext'
import { emptyState } from '../data/emptyState'
import CustomersPage from './CustomersPage'

describe('CustomersPage actions',()=>{
  beforeEach(()=>localStorage.clear())

  it('muestra solo el CTA central cuando no hay clientes',()=>{
    render(<FleetProvider><CustomersPage/></FleetProvider>)
    expect(screen.getByRole('button',{name:'Añadir cliente'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Nuevo cliente'})).not.toBeInTheDocument()
  })

  it('muestra el CTA superior cuando ya existen clientes',()=>{
    localStorage.setItem(STORAGE_KEY,JSON.stringify({...structuredClone(emptyState),customers:[{id:'c1',name:'Pablo',email:'',phone:'',dni:'',rentals:0}]}))
    render(<FleetProvider><CustomersPage/></FleetProvider>)
    expect(screen.getByRole('button',{name:'Nuevo cliente'})).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Añadir cliente'})).not.toBeInTheDocument()
  })
})
