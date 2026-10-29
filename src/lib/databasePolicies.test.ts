// @vitest-environment node
/// <reference types="node" />
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
let db:PGlite
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222'
const sessionA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sessionB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
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
  await db.exec(readFileSync('supabase/migrations/20261017120000_remove_push_notifications.sql','utf8'))
  await db.exec(readFileSync('supabase/migrations/20261029120000_expenses.sql','utf8'))
  const state={events:[{id:'event-a',revision:'rev1',type:'itv',status:'active'}],adminSettings:{notifications:{enabled:true,categories:['itv']}}}
  await db.query('insert into fleet_state(id,user_id,state) values ($1,$2,$3),($4,$5,$6)', ['a',a,state,'b',b,{events:[]}])
},20000)
afterAll(async()=>{await db?.close()})
describe('políticas de base de datos',()=>{
  it('elimina las tablas y funciones de notificaciones push',async()=>{
    const {rows}=await db.query<{name:string}>("select table_name as name from information_schema.tables where table_schema='public' and table_name like 'notification%' union all select routine_name from information_schema.routines where routine_schema='public' and routine_name like 'notification%'")
    expect(rows).toEqual([])
  })
  it('aísla los gastos por usuario y aplica las reglas de categoría',async()=>{
    const insert=(owner:string,id:string,vehicle:string|null=null)=>db.query("insert into expenses(id,user_id,date,amount,category,vehicle_id) values ($1,$2,'2026-10-29',12.5,'combustible',$3)",[id,owner,vehicle])
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`)
    await insert(a,'e1','v1')
    await insert(a,'e2')
    await expect(insert(b,'e3')).rejects.toThrow(/row-level security/)
    await expect(db.query("insert into expenses(id,user_id,date,amount,category,travel_type) values ('e4',$1,'2026-10-29',1,'material','taxi')",[a])).rejects.toThrow(/check/)
    await expect(db.query("insert into expenses(id,user_id,date,amount,category,liters) values ('e5',$1,'2026-10-29',1,'otros',10)",[a])).rejects.toThrow(/check/)
    await expect(db.query("insert into expenses(id,user_id,date,amount,category) values ('e6',$1,'2026-10-29',1,'inventada')",[a])).rejects.toThrow(/enum/)
    expect((await db.query<{id:string;vehicle_id:string|null}>('select id,vehicle_id from expenses order by id')).rows).toEqual([{id:'e1',vehicle_id:'v1'},{id:'e2',vehicle_id:null}])
    await db.exec(`select set_config('request.jwt.claim.sub','${b}',false)`)
    expect((await db.query('select * from expenses')).rows).toHaveLength(0)
    expect((await db.query("delete from expenses where id='e1' returning id")).rows).toHaveLength(0)
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
})
