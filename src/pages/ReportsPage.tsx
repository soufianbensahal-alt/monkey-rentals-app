import { useMemo } from 'react'
import { AlertCircle, ArrowDownRight, ArrowUpRight, Car, CircleDollarSign, TrendingUp } from 'lucide-react'
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, EmptyState, PageHeader } from '../components/ui'
import { date, euro } from '../lib/format'
import { buildReport, type EconomicMovement } from '../lib/reports'
import { vehicleLabel } from '../lib/vehicles'
import { useFleet } from '../store/FleetContext'

const monthFormatter = new Intl.DateTimeFormat('es-ES',{month:'short',year:'2-digit'})
const COLORS = ['#f04438','#f97316','#0f766e','#d97706','#64748b','#78716c']
const monthLabel = (value:string) => monthFormatter.format(new Date(`${value}-01T12:00:00`)).replace('.','')

export default function ReportsPage(){
  const {state}=useFleet()
  const report=useMemo(()=>buildReport(state),[state])
  const vehicleName=(id?:string)=>id?vehicleLabel(state.vehicles.find(item=>item.id===id)):'Sin datos'
  const hasData=report.hasEconomicData
  return <div className="fade-up reports-page"><PageHeader eyebrow="Inteligencia de negocio" title="Informes" description="Ingresos, gastos y rentabilidad calculados a partir de los movimientos registrados en la app."/>
    {!hasData?<section className="card"><EmptyState title="No hay datos suficientes para generar informes." description="Cuando registres pagos, gastos de mantenimiento, ITV o impuestos, aparecerán aquí tus gráficos e indicadores."/></section>:<>
      <section className="reports-summary" aria-label="Resumen económico">
        <SummaryCard label="Ingresos cobrados" value={report.summary.totalPaid} detail={`${euro.format(report.summary.monthIncome)} este mes`} icon={ArrowUpRight} tone="income"/>
        <SummaryCard label="Ingresos pendientes" value={report.summary.totalPending} detail="Cobros todavía no recibidos" icon={CircleDollarSign} tone="secondary"/>
        <SummaryCard label="Dinero atrasado" value={report.summary.totalOverdue} detail="Requiere seguimiento" icon={AlertCircle} tone="overdue"/>
        <SummaryCard label="Gastos del mes" value={report.summary.monthExpenses} detail="Gastos realizados" icon={ArrowDownRight} tone="expense"/>
        <SummaryCard label="Beneficio estimado" value={report.summary.monthProfit} detail="Cobrado del mes menos gastos" icon={TrendingUp} tone="profit"/>
        <SummaryCard label="Vehículo con más ingresos" value={vehicleName(report.summary.topIncomeVehicleId)} detail="Según cobros pagados" icon={Car} tone="secondary" text/>
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-[1.65fr_.85fr]">
        <article className="card report-panel"><PanelTitle title="Evolución mensual" description="Cobrado, pendiente, atrasado, gastos y beneficio real"/>{report.monthly.length?<div className="report-chart-main" aria-label="Gráfico mensual de ingresos cobrados, pendientes, atrasados, gastos y beneficio"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={report.monthly} margin={{top:16,right:10,left:0,bottom:0}}><CartesianGrid vertical={false} stroke="var(--report-grid)"/><XAxis dataKey="month" tickFormatter={monthLabel} axisLine={false} tickLine={false} tick={{fill:'var(--report-muted)',fontSize:12}}/><YAxis axisLine={false} tickLine={false} width={62} tickFormatter={value=>`${Math.round(Number(value))} €`} tick={{fill:'var(--report-muted)',fontSize:12}}/><Tooltip content={<MonthlyTooltip/>}/><Legend wrapperStyle={{fontSize:12,paddingTop:14}}/><Bar className="report-bar" name="Cobrados" dataKey="paid" fill="#f97316" radius={[7,7,2,2]} maxBarSize={28}/><Bar className="report-bar" name="Pendientes" dataKey="pending" fill="#64748b" radius={[7,7,2,2]} maxBarSize={28}/><Bar className="report-bar" name="Atrasados" dataKey="overdue" fill="#dc2626" radius={[7,7,2,2]} maxBarSize={28}/><Bar className="report-bar" name="Gastos" dataKey="expenses" fill="#fb7185" radius={[7,7,2,2]} maxBarSize={28}/><Line name="Beneficio real" dataKey="profit" type="monotone" stroke="#0f766e" strokeWidth={3} dot={{r:4,fill:'#0f766e',strokeWidth:2,stroke:'var(--report-surface)'}} activeDot={{r:7}}/></ComposedChart></ResponsiveContainer></div>:<p className="report-small-empty">Los movimientos económicos aparecerán aquí por mes.</p>}</article>
        <article className="card report-panel"><PanelTitle title="Distribución de gastos" description="Peso de cada categoría registrada"/>{report.categories.length?<><div className="report-chart-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={report.categories} dataKey="total" nameKey="category" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="none">{report.categories.map((item,index)=><Cell key={item.category} fill={COLORS[index%COLORS.length]}/>)}</Pie><Tooltip content={<ExpenseTooltip/>}/></PieChart></ResponsiveContainer><div className="report-donut-total"><span>Gastos</span><strong>{euro.format(report.categories.reduce((sum,item)=>sum+item.total,0))}</strong></div></div><div className="report-legend">{report.categories.map((item,index)=><div key={item.category}><span style={{background:COLORS[index%COLORS.length]}}/><p>{item.category}</p><strong>{euro.format(item.total)}</strong></div>)}</div></>:<p className="report-small-empty">Todavía no hay gastos realizados.</p>}</article>
      </section>
      <section className="card mt-5 overflow-hidden"><div className="p-5 sm:p-6"><PanelTitle title="Últimos movimientos" description="Cobros y gastos consolidados, sin duplicados"/></div>{report.movements.length?<div className="overflow-x-auto"><table className="data-table report-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Vehículo</th><th>Cliente</th><th>Importe</th><th>Estado</th></tr></thead><tbody>{report.movements.map(item=><MovementRow key={item.id} item={item} vehicle={vehicleName(item.vehicleId)} customer={state.customers.find(customer=>customer.id===item.customerId)?.name}/>)}</tbody></table></div>:<p className="report-small-empty">Hay datos económicos registrados, pero todavía no generan movimientos contabilizables.</p>}</section>
    </>}
  </div>
}

function SummaryCard({label,value,detail,icon:Icon,tone,text=false}:{label:string;value:number|string;detail:string;icon:typeof CircleDollarSign;tone:'income'|'expense'|'profit'|'overdue'|'secondary';text?:boolean}){return <article className={`report-summary-card report-summary-${tone}`}><div><p>{label}</p><strong className={text?'report-summary-name':''}>{typeof value==='number'?euro.format(value):value}</strong><span>{detail}</span></div><i><Icon size={20}/></i></article>}
function PanelTitle({title,description}:{title:string;description:string}){return <div><h2 className="font-display text-xl font-bold text-ink">{title}</h2><p className="mt-1 text-sm text-stone-500">{description}</p></div>}
function MonthlyTooltip({active,payload,label}:{active?:boolean;payload?:Array<{name:string;value:number;color:string}>;label?:string}){if(!active||!payload?.length||!label)return null;return <div className="report-tooltip"><strong>{monthLabel(label)}</strong>{payload.map(item=><p key={item.name}><span style={{background:item.color}}/>{item.name}<b>{euro.format(item.value)}</b></p>)}</div>}
function ExpenseTooltip({active,payload}:{active?:boolean;payload?:Array<{name:string;value:number;color:string}>}){const item=payload?.[0];if(!active||!item)return null;return <div className="report-tooltip"><strong>{item.name}</strong><p><span style={{background:item.color}}/>Gasto<b>{euro.format(item.value)}</b></p></div>}
function MovementRow({item,vehicle,customer}:{item:EconomicMovement;vehicle:string;customer?:string}){const tone=item.status==='pagado'||item.status==='registrado'?'success':item.status==='atrasado'?'danger':'warning';return <tr><td>{date(item.date)}</td><td><span className={`report-kind report-kind-${item.kind}`}>{item.kind==='ingreso'?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>} {item.category}</span></td><td className="font-semibold text-ink">{vehicle}</td><td>{customer||'—'}</td><td className={`font-bold tabular-nums ${item.kind==='ingreso'?'text-brand-600':'text-red-600'}`}>{item.kind==='ingreso'?'+':'−'} {euro.format(item.amount)}</td><td><Badge tone={tone}>{item.status}</Badge></td></tr>}
