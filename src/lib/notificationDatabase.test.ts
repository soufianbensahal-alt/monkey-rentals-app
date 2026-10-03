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
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`)
  await db.exec(readFileSync('supabase/migrations/20260928195715_materials_debts_notification_reliability.sql','utf8'))
  await db.exec(readFileSync('supabase/migrations/20261003090732_reduce_egress_private_media.sql','utf8'))
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
  it('planifica por separado, limita a tres intentos y conserva el evento al enviar',async()=>{
    const key='retry-key',scheduled=new Date(Date.now()-60000).toISOString()
    const claim=async()=>(await db.query<{notification_claim:boolean}>('select notification_claim($1,$2,$3,$4,$5)',[device,'event-a','rev1',key,scheduled])).rows[0].notification_claim
    expect(await claim()).toBe(true)
    for(let i=0;i<2;i++){
      await db.query("update notification_deliveries set status='failed',next_attempt_at=now()-interval '1 minute' where delivery_key=$1",[key])
      expect(await claim()).toBe(true)
    }
    await db.query("update notification_deliveries set status='failed',next_attempt_at=now()-interval '1 minute' where delivery_key=$1",[key])
    expect(await claim()).toBe(false)
    expect((await db.query<{attempts:number}>("select attempts from notification_deliveries where delivery_key=$1",[key])).rows[0].attempts).toBe(3)
    expect((await db.query("select * from notification_logs where reminder_id=$1",[key])).rows).toHaveLength(3)
    expect((await db.query("select state->'events' as events from fleet_state where user_id=$1",[a])).rows[0]).toMatchObject({events:[{id:'event-a'}]})
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${b}',false);`)
    expect((await db.query('select * from notification_logs')).rows).toHaveLength(0)
    await db.exec('reset role')
  })
  it('aísla las fotografías privadas por propietario',async()=>{
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`)
    await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)',['maintenance-materials',`${a}/v/m/p/image.webp`])
    await expect(db.query('insert into storage.objects(bucket_id,name) values ($1,$2)',['maintenance-materials',`${b}/v/m/p/image.webp`])).rejects.toThrow(/row-level security/)
    await db.exec(`select set_config('request.jwt.claim.sub','${b}',false)`)
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(0)
    await db.exec('reset role')
  })
  it('mantiene RLS por usuario en imágenes de vehículos y documentos de clientes',async()=>{
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`)
    await db.query('insert into vehicle_images(id,user_id,vehicle_id,storage_path,thumbnail_path,mime_type,file_size) values ($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),a,'v1',`${a}/v1/full.webp`,`${a}/v1/thumb.webp`,'image/webp',1000])
    await db.query('insert into client_documents(id,user_id,customer_id,document_type,file_name,storage_path,mime_type,file_size,file_type) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',['doc-a',a,'c1','DNI / NIE','dni.pdf',`${a}/c1/dni.pdf`,'application/pdf',1000,'pdf'])
    await expect(db.query('insert into client_documents(id,user_id,customer_id,document_type,file_name,storage_path,mime_type,file_size,file_type) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',['doc-b',b,'c2','Otro','otro.pdf',`${b}/c2/otro.pdf`,'application/pdf',1000,'pdf'])).rejects.toThrow(/row-level security/)
    await db.exec(`select set_config('request.jwt.claim.sub','${b}',false)`)
    expect((await db.query('select * from vehicle_images')).rows).toHaveLength(0)
    expect((await db.query('select * from client_documents')).rows).toHaveLength(0)
    await db.exec('reset role')
  })
  it('protege principal e historial de deuda en el servidor, también con clientes antiguos',async()=>{
    const debt={id:'d',customerId:'c',originalAmount:100},payment={id:'p',debtId:'d',customerId:'c',amount:40}
    await db.query("update fleet_state set state=state || $1::jsonb where user_id=$2",[{debts:[debt],debtPayments:[payment]},a])
    await expect(db.query("update fleet_state set state=jsonb_set(state,'{debtPayments}','[]') where user_id=$1",[a])).rejects.toThrow('immutable')
    await expect(db.query("update fleet_state set state=jsonb_set(state,'{debts,0,originalAmount}','60') where user_id=$1",[a])).rejects.toThrow('principal')
    await expect(db.query("update fleet_state set state=jsonb_set(state,'{debtPayments}', $1::jsonb) where user_id=$2",[[payment,{...payment,id:'p2',amount:70}],a])).rejects.toThrow('overpayment')
    await db.query("update fleet_state set state=state-'debts'-'debtPayments' where user_id=$1",[a])
    expect((await db.query("select state->'debtPayments' as payments from fleet_state where user_id=$1",[a])).rows[0]).toEqual({payments:[payment]})
  })
  it('cancela versiones antiguas y bloquea eventos borrados, categorías desactivadas y sesiones revocadas',async()=>{
    await db.query(`update fleet_state set state=jsonb_set(state,'{events,0,revision}','"rev2"') where user_id=$1`,[a])
    expect((await db.query<{status:string}>("select status from notification_deliveries where delivery_key='unique-key'")).rows[0].status).toBe('cancelled')
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
