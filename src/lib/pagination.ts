import { useMemo, useState } from 'react'

export function usePagination<T>(items:T[],pageSize:number) {
  const [requestedPage,setPage]=useState(1)
  const pages=Math.max(1,Math.ceil(items.length/pageSize))
  const page=Math.min(requestedPage,pages)
  const visible=useMemo(()=>items.slice((page-1)*pageSize,page*pageSize),[items,page,pageSize])
  return {visible,page,pages,total:items.length,setPage}
}
