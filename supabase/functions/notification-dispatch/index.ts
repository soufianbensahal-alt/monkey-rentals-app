import { handleDispatch } from './handler.ts'
Deno.serve(async request=>{
  try {return await handleDispatch(request)}
  catch(error) {console.error('notification-dispatch startup',error);return Response.json({error:error instanceof Error?error.message:'Startup failed'},{status:503})}
})
