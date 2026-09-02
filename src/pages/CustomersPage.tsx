import { useDeferredValue, useMemo, useState, type FormEvent } from 'react'
import { Building2, Download, Eye, FileText, Mail, Pencil, Phone, Plus, Search, Upload, User } from 'lucide-react'
import { Badge, ConfirmButton, EmptyState, Modal, PageHeader } from '../components/ui'
import { useFleet } from '../store/FleetContext'
import { date, euro, uid } from '../lib/format'
import { effectivePaymentStatus } from '../lib/payments'
import type { ClientDocument, ClientDocumentType, Customer } from '../types'

const blank: Customer = { id:'', name:'', email:'', phone:'', dni:'', company:'', rentals:0 }
const documentTypes: ClientDocumentType[] = ['DNI / NIE', 'Pasaporte', 'Carnet de conducir', 'Contrato firmado', 'Justificante', 'Otro']
const acceptedDocumentTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const maxDocumentSize = 10 * 1024 * 1024

export default function CustomersPage() {
  const { state, upsert, remove } = useFleet()
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [documentCustomer, setDocumentCustomer] = useState<Customer | null>(null)
  const [documentError, setDocumentError] = useState('')
  const [selectedDocumentFile, setSelectedDocumentFile] = useState<{ fileName: string; mimeType: string; size: number; dataUrl: string } | null>(null)

  const rows = useMemo(() => state.customers.filter(customer => {
    const customerDocs = state.clientDocuments.filter(document => document.customerId === customer.id)
    return `${customer.name} ${customer.email} ${customer.phone} ${customer.dni} ${customer.company} ${customerDocs.map(document => `${document.type} ${document.fileName}`).join(' ')}`.toLowerCase().includes(deferred.toLowerCase())
  }), [state.customers, state.clientDocuments, deferred])

  const today = new Date().toISOString().slice(0, 10)
  const openDocumentModal = (customer: Customer) => {
    setDocumentCustomer(customer)
    setSelectedDocumentFile(null)
    setDocumentError('')
  }
  const saveCustomer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    upsert('customers', {
      id:editing?.id || uid('c'),
      name:String(form.get('name')).trim(),
      email:String(form.get('email')).trim(),
      phone:String(form.get('phone')).trim(),
      dni:String(form.get('dni')).trim().toUpperCase(),
      company:String(form.get('company')).trim(),
      rentals:editing?.rentals || 0,
    })
    setEditing(null)
  }
  const onFileChange = (file: File | undefined) => {
    setDocumentError('')
    setSelectedDocumentFile(null)
    if (!file) return
    if (!acceptedDocumentTypes.includes(file.type)) {
      setDocumentError('Formato no válido. Sube PDF, JPG, PNG o WebP.')
      return
    }
    if (file.size > maxDocumentSize) {
      setDocumentError('El archivo supera el máximo de 10 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setSelectedDocumentFile({ fileName:file.name, mimeType:file.type, size:file.size, dataUrl:String(reader.result) })
    reader.onerror = () => setDocumentError('No se ha podido leer el archivo.')
    reader.readAsDataURL(file)
  }
  const saveDocument = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!documentCustomer || !selectedDocumentFile) {
      setDocumentError('Selecciona un archivo para guardarlo.')
      return
    }
    const form = new FormData(event.currentTarget)
    upsert('clientDocuments', {
      id:uid('cd'),
      customerId:documentCustomer.id,
      type:String(form.get('type')) as ClientDocumentType,
      ...selectedDocumentFile,
      uploadedAt:new Date().toISOString(),
      notes:String(form.get('notes')).trim(),
    })
    setDocumentCustomer(null)
  }

  return <div className="fade-up">
    <PageHeader
      eyebrow="Relaciones"
      title="Clientes"
      description="Contacto, alquileres, pagos, multas y documentación de cada cliente."
      action={state.customers.length ? <button className="btn-primary" onClick={() => setEditing({ ...blank })}><Plus size={18}/> Nuevo cliente</button> : undefined}
    />
    {state.customers.length > 0 && <label className="group relative mb-5 block max-w-xl">
      <span className="sr-only">Buscar cliente</span>
      <input className="field search-field" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar cliente o documento"/>
      {!query && <Search className="search-icon pointer-events-none absolute top-1/2 -translate-y-1/2 text-brand-500 group-focus-within:hidden" size={18}/>}
    </label>}

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map(customer => {
        const rentals = state.rentals.filter(rental => rental.customerId === customer.id)
        const rentalIds = rentals.map(rental => rental.id)
        const documents = state.clientDocuments.filter(document => document.customerId === customer.id)
        const overdue = state.payments.filter(payment => rentalIds.includes(payment.rentalId) && effectivePaymentStatus(payment) === 'atrasado').reduce((sum, payment) => sum + payment.amount, 0)
        const fines = state.fines.filter(fine => fine.customerId === customer.id)
        const phoneHref = `tel:${customer.phone.replace(/[^\d+]/g, '')}`
        const futureReservation = rentals.filter(rental => (rental.status === 'pendiente' || rental.status === 'activo') && rental.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

        return <article className="card p-5" key={customer.id}>
          <div className="flex items-start justify-between gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">{customer.company ? <Building2/> : <User/>}</span>
            <div className="flex items-center gap-2">
              {customer.phone && <a href={phoneHref} aria-label={`Llamar a ${customer.name}`} title={`Llamar a ${customer.phone}`} className="customer-call-button"><Phone size={18}/><span>Llamar</span></a>}
              <button onClick={() => setEditing(customer)} aria-label={`Editar ${customer.name}`} className="grid size-10 place-items-center rounded-xl text-stone-500 transition hover:bg-brand-50 hover:text-brand-600"><Pencil size={18}/></button>
              <ConfirmButton title="Eliminar cliente" message="¿Seguro que quieres eliminar este cliente? Esta acción no se puede deshacer." onConfirm={() => remove('customers', customer.id)}/>
            </div>
          </div>
          <h2 className="mt-4 font-display text-lg font-bold">{customer.name}</h2>
          <p className="text-sm text-stone-500">{customer.company || 'Cliente particular'}{customer.dni ? ` · ${customer.dni}` : ''}</p>
          <div className="mt-4 space-y-2 text-sm text-stone-600">
            {customer.email && <p className="flex items-center gap-2"><Mail size={15}/>{customer.email}</p>}
            {customer.phone && <p className="flex items-center gap-2"><Phone size={15}/>{customer.phone}</p>}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-orange-100 pt-4 text-center">
            <div><p className="font-bold">{rentals.length}</p><p className="text-[11px] text-stone-500">Alquileres</p></div>
            <div><p className="font-bold text-red-700">{euro.format(overdue)}</p><p className="text-[11px] text-stone-500">Atrasado</p></div>
            <div><p className="font-bold">{fines.length}</p><p className="text-[11px] text-stone-500">Multas</p></div>
          </div>
          {(rentals.some(rental => rental.status === 'activo') || futureReservation) && <div className="mt-4 flex flex-wrap gap-2">
            {rentals.some(rental => rental.status === 'activo') && <Badge tone="success">Alquiler activo</Badge>}
            {futureReservation && <Badge tone="info">Reserva {date(futureReservation.startDate)}</Badge>}
          </div>}
          <CustomerDocuments documents={documents} onAdd={() => openDocumentModal(customer)} onDelete={id => remove('clientDocuments', id)}/>
        </article>
      })}
      {!rows.length && <div className="card md:col-span-2 xl:col-span-3">
        <EmptyState
          title={state.customers.length ? 'No hay clientes que coincidan.' : 'Todavía no hay clientes.'}
          description={state.customers.length ? 'Ajusta la búsqueda para ver más resultados.' : 'Añade el primer cliente para crear alquileres.'}
          action={!state.customers.length ? <button className="btn-primary" onClick={() => setEditing({ ...blank })}><Plus size={18}/> Añadir cliente</button> : undefined}
        />
      </div>}
    </div>

    {editing && <Modal title={editing.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={() => setEditing(null)}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveCustomer}>
        <Field label="Nombre completo" name="name" value={editing.name} required/>
        <Field label="DNI / NIE (opcional)" name="dni" value={editing.dni}/>
        <Field label="Email (opcional)" name="email" type="email" value={editing.email}/>
        <Field label="Teléfono (opcional)" name="phone" type="tel" value={editing.phone}/>
        <div className="sm:col-span-2"><Field label="Empresa (opcional)" name="company" value={editing.company || ''}/></div>
        <p className="text-sm text-stone-500 sm:col-span-2">Solo el nombre es necesario. El resto puede completarse más adelante.</p>
        <div className="flex gap-3 sm:col-span-2 sm:justify-end"><button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button><button className="btn-primary">Guardar cliente</button></div>
      </form>
    </Modal>}

    {documentCustomer && <Modal title={`Añadir documento · ${documentCustomer.name}`} onClose={() => setDocumentCustomer(null)}>
      <form className="grid gap-4" onSubmit={saveDocument}>
        {documentError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{documentError}</p>}
        <label><span className="label">Tipo de documento</span><select className="field" name="type">{documentTypes.map(type => <option key={type}>{type}</option>)}</select></label>
        <label className="rounded-2xl border border-dashed border-orange-200 bg-brand-50/50 p-4">
          <span className="label">Archivo *</span>
          <span className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="btn-primary inline-flex w-fit"><Upload size={18}/> Seleccionar archivo</span>
            <span className="text-sm text-stone-500">{selectedDocumentFile?.fileName || 'PDF, JPG, PNG o WebP. Máximo 10 MB.'}</span>
          </span>
          <input className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={event => onFileChange(event.currentTarget.files?.[0])}/>
        </label>
        <label><span className="label">Notas</span><textarea className="field min-h-24" name="notes" placeholder="Ej. DNI renovado, contrato firmado en oficina..."/></label>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" className="btn-secondary" onClick={() => setDocumentCustomer(null)}>Cancelar</button><button className="btn-primary">Guardar documento</button></div>
      </form>
    </Modal>}
  </div>
}

function CustomerDocuments({ documents, onAdd, onDelete }: { documents: ClientDocument[]; onAdd: () => void; onDelete: (id: string) => void }) {
  return <section className="mt-5 rounded-2xl border border-orange-100 bg-brand-50/30 p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="font-display text-sm font-bold text-ink">Documentos del cliente</p>
        <p className="mt-1 text-xs text-stone-500">{documents.length ? `${documents.length} archivo${documents.length === 1 ? '' : 's'} sincronizado${documents.length === 1 ? '' : 's'}` : 'Sin documentación guardada'}</p>
      </div>
      {documents.length > 0 && <button type="button" className="btn-secondary min-h-9 px-3 py-1.5 text-xs" onClick={onAdd}><Plus size={15}/> Añadir</button>}
    </div>
    {documents.length ? <div className="mt-3 space-y-2">
      {documents.map(document => <article key={document.id} className="rounded-xl border border-orange-100 bg-white p-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><FileText size={17}/></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{document.type}</p>
            <p className="truncate text-xs text-stone-500">{document.fileName} · {formatFileSize(document.size)}</p>
            <p className="mt-1 text-xs text-stone-400">Subido el {date(document.uploadedAt.slice(0, 10))}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={document.dataUrl} target="_blank" rel="noreferrer"><Eye size={15}/> Ver</a>
          <a className="btn-secondary min-h-9 px-3 py-1.5 text-xs" href={document.dataUrl} download={document.fileName}><Download size={15}/> Descargar</a>
          <ConfirmButton
            className="btn-secondary min-h-9 px-3 py-1.5 text-xs text-red-700"
            title="Eliminar documento"
            message="¿Seguro que quieres eliminar este documento del cliente? Esta acción no se puede deshacer."
            onConfirm={() => onDelete(document.id)}
          />
        </div>
      </article>)}
    </div> : <div className="mt-4 rounded-xl border border-dashed border-orange-200 bg-white/70 p-4 text-center">
      <p className="text-sm font-bold text-ink">No hay documentos guardados.</p>
      <button type="button" className="btn-primary mt-3" onClick={onAdd}><Plus size={18}/> Añadir documento</button>
    </div>}
  </section>
}

function Field({ label, name, value, type = 'text', required = false }: { label: string; name: string; value: string; type?: string; required?: boolean }) {
  return <label><span className="label">{label}</span><input className="field" name={name} type={type} defaultValue={value} required={required}/></label>
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}
