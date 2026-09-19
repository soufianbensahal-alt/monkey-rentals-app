// @vitest-environment node
/// <reference types="node" />
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
let db:PGlite
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
const sessionA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sessionB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
let device:string
beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
    grant usage on schema auth to authenticated;
    insert into auth.users values('${a}'),('${b}');
    insert into auth.sessions values('${sessionA}','${a}',null),('${sessionB}','${b}',null);`)
  await db.exec(readFileSync('supabase/fleet_state.sql','utf8'))
  await db.exec(readFileSync('supabase/migrations/20260919113200_notification_delivery.sql','utf8'))
  const state={events:[{id:'event-a',revision:'rev1',type:'itv',status:'active'}],adminSettings:{notifications:{enabled:true,categories:['itv']}}}
  await db.query('insert into fleet_state(id,user_id,state) values ($1,$2,$3),($4,$5,$6)', ['a',a,state,'b',b,{events:[]}])
  await db.query('select notification_register_device($1,$2,$3,$4)',[a,sessionA,'https://fcm.googleapis.com/fcm/send/test',{}])
  device=(await db.query<{id:string}>('select id from notification_subscriptions')).rows[0].id
},20000)
afterAll(async()=>{await db?.close()})
describe('aislamiento y registro atómico de notificaciones',()=>{
  it('solo permite leer dispositivos y entregas de la propia cuenta',async()=>{
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${b}',false);`)
    expect((await db.query('select * from notification_subscriptions')).rows).toHaveLength(0)
    await expect(db.query('select notification_session_active($1,$2)',[a,sessionA])).rejects.toThrow(/permission denied/)
    await expect(db.query('insert into notification_subscriptions(user_id,session_id,endpoint,keys) values ($1,$2,$3,$4)',[b,sessionB,'https://example.com',{}])).rejects.toThrow(/permission denied/)
    await db.exec(`select set_config('request.jwt.claim.sub','${a}',false)`)
    expect((await db.query('select * from notification_subscriptions')).rows).toHaveLength(1)
    await db.exec('reset role')
  })
  it('rechaza vincular sesiones de otro usuario y secuestrar un endpoint',async()=>{
    await expect(db.query('select notification_register_device($1,$2,$3,$4)',[b,sessionA,'https://fcm.googleapis.com/fcm/send/other',{}])).rejects.toThrow('Invalid session')
    await expect(db.query('select notification_register_device($1,$2,$3,$4)',[b,sessionB,'https://fcm.googleapis.com/fcm/send/test',{}])).rejects.toThrow('another account')
  })
  it('una clave de entrega admite solo una reclamación incluso con llamadas simultáneas',async()=>{
    const claim=()=>db.query<{notification_claim:boolean}>("select notification_claim($1,'event-a','rev1','unique-key',now())",[device])
    const result=await Promise.all([claim(),claim()])
    expect(result.map(r=>r.rows[0].notification_claim).sort()).toEqual([false,true])
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${b}',false);`)
    expect((await db.query('select * from notification_deliveries')).rows).toHaveLength(0)
    await db.exec('reset role')
  })
  it('cancela versiones antiguas y bloquea eventos borrados, categorías desactivadas y sesiones revocadas',async()=>{
    await db.query(`update fleet_state set state=jsonb_set(state,'{events,0,revision}','"rev2"') where user_id=$1`,[a])
    expect((await db.query<{status:string}>('select status from notification_deliveries')).rows[0].status).toBe('cancelled')
    const claim=async(revision:string,key:string)=>(await db.query<{notification_claim:boolean}>('select notification_claim($1,$2,$3,$4,now())',[device,'event-a',revision,key])).rows[0].notification_claim
    expect(await claim('rev1','old')).toBe(false)
    await db.query(`update fleet_state set state=jsonb_set(state,'{adminSettings,notifications,enabled}','false') where user_id=$1`,[a])
    expect(await claim('rev2','disabled')).toBe(false)
    await db.query(`update fleet_state set state=jsonb_set(state,'{adminSettings,notifications,enabled}','true') where user_id=$1`,[a])
    await db.query(`update fleet_state set state=jsonb_set(state,'{events}','[]') where user_id=$1`,[a])
    expect(await claim('rev2','deleted')).toBe(false)
    await db.query('delete from auth.sessions where id=$1',[sessionA])
    expect((await db.query('select * from notification_subscriptions')).rows).toHaveLength(0)
    expect(await claim('rev2','logout')).toBe(false)
  })
})
