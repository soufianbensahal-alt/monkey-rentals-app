type DiagnosticEntry = {
  at:string
  section:string
  label:string
  method:string
  status:number
  bytes:number
  durationMs:number
}

const enabled=import.meta.env.DEV&&import.meta.env.MODE!=='test'
const entries:DiagnosticEntry[]=[]
const section=()=>typeof window==='undefined'?'server':window.location.pathname.replace(/^\/app\/?/,'')||'dashboard'
const expose=()=>{
  if(!enabled||typeof window==='undefined')return
  window.__MONKEY_SUPABASE_DIAGNOSTICS__={
    reset:()=>{entries.length=0},
    snapshot:()=>entries.map(entry=>({...entry})),
    summary:()=>Object.values(entries.reduce<Record<string,{section:string;requests:number;bytes:number}>>((result,entry)=>{
      const current=result[entry.section]||{section:entry.section,requests:0,bytes:0}
      current.requests+=1;current.bytes+=entry.bytes;result[entry.section]=current;return result
    },{})),
  }
}

function record(entry:Omit<DiagnosticEntry,'at'|'section'>) {
  if(!enabled)return
  entries.push({at:new Date().toISOString(),section:section(),...entry})
  console.debug('[Supabase egress]',entries.at(-1))
  expose()
}

function requestLabel(url:string,method:string) {
  try {
    const parsed=new URL(url)
    const path=parsed.pathname
    if(path.includes('/auth/'))return `auth.${method.toLowerCase()}`
    if(path.includes('/storage/'))return `storage.${method.toLowerCase()}`
    if(path.includes('/functions/'))return `function.${method.toLowerCase()}`
    const table=path.split('/rest/v1/')[1]?.split('/')[0]||'database'
    return `database.${table}.${method.toLowerCase()}`
  }catch{return `supabase.${method.toLowerCase()}`}
}

export async function trackedFetch(input:RequestInfo|URL,init:RequestInit={}) {
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url
  const method=(init.method||'GET').toUpperCase(),started=performance.now()
  const response=await fetch(input,init)
  if(enabled){
    const fallback=Number(response.headers?.get?.('content-length')||0)
    if(typeof response.clone==='function')void response.clone().arrayBuffer().then(buffer=>record({label:requestLabel(url,method),method,status:response.status,bytes:buffer.byteLength,durationMs:Math.round(performance.now()-started)})).catch(()=>record({label:requestLabel(url,method),method,status:response.status,bytes:fallback,durationMs:Math.round(performance.now()-started)}))
    else record({label:requestLabel(url,method),method,status:response.status,bytes:fallback,durationMs:Math.round(performance.now()-started)})
  }
  return response
}

if(enabled&&typeof window!=='undefined'){
  expose()
  const seen=new Set<string>()
  const observe=(list:PerformanceObserverEntryList)=>{
    for(const item of list.getEntries() as PerformanceResourceTiming[]){
      if(!item.name.includes('.supabase.co/storage/v1/'))continue
      const key=`${item.name}|${item.startTime}`;if(seen.has(key))continue;seen.add(key)
      record({label:'storage.asset',method:'GET',status:200,bytes:item.encodedBodySize||item.transferSize||0,durationMs:Math.round(item.duration)})
    }
  }
  if(typeof PerformanceObserver!=='undefined'){
    const observer=new PerformanceObserver(observe)
    observer.observe({type:'resource',buffered:true})
  }
}
