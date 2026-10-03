/// <reference types="vite/client" />

interface Window {
  __MONKEY_SUPABASE_DIAGNOSTICS__?: {
    reset:()=>void
    snapshot:()=>Array<{at:string;section:string;label:string;method:string;status:number;bytes:number;durationMs:number}>
    summary:()=>Array<{section:string;requests:number;bytes:number}>
  }
}
