-- Fleet expenses. vehicle_id points to a vehicle in fleet_state.state.vehicles (text id, no FK):
-- with a value the expense belongs to that vehicle, null means a generic fleet expense.
do $$ begin
  create type public.expense_category as enum ('material','combustible','desplazamientos','tramites','compra_vehiculo','otros');
exception when duplicate_object then null; end $$;

create table if not exists public.expenses (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  amount numeric(12,2) not null check (amount >= 0 and amount <= 10000000),
  category public.expense_category not null,
  description text not null default '' check (length(description) <= 2000),
  supplier text check (supplier is null or length(supplier) <= 200),
  vehicle_id text,
  liters numeric(10,2) check (liters is null or liters >= 0),
  odometer_km integer check (odometer_km is null or odometer_km >= 0),
  travel_type text check (travel_type is null or travel_type in ('vuelo','tren','taxi','otro')),
  procedure_type text check (procedure_type is null or procedure_type in ('cambio_nombre','transferencia','gestoria')),
  attachment_name text,
  attachment_path text unique,
  attachment_thumbnail_path text,
  attachment_mime text,
  attachment_size bigint check (attachment_size is null or (attachment_size >= 0 and attachment_size <= 10485760)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Extra fields only apply to their own category.
  check ((liters is null and odometer_km is null) or category = 'combustible'),
  check (travel_type is null or category = 'desplazamientos'),
  check (procedure_type is null or category = 'tramites')
);
create index if not exists expenses_owner_date_idx on public.expenses(user_id, date desc);
create index if not exists expenses_owner_vehicle_idx on public.expenses(user_id, vehicle_id);

alter table public.expenses enable row level security;
alter table public.expenses force row level security;
revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;

drop policy if exists "expenses_owner_select" on public.expenses;
drop policy if exists "expenses_owner_insert" on public.expenses;
drop policy if exists "expenses_owner_update" on public.expenses;
drop policy if exists "expenses_owner_delete" on public.expenses;
create policy "expenses_owner_select" on public.expenses for select to authenticated using ((select auth.uid()) = user_id);
create policy "expenses_owner_insert" on public.expenses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "expenses_owner_update" on public.expenses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "expenses_owner_delete" on public.expenses for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('expense-receipts','expense-receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "expense_receipts_storage_select" on storage.objects;
drop policy if exists "expense_receipts_storage_insert" on storage.objects;
drop policy if exists "expense_receipts_storage_update" on storage.objects;
drop policy if exists "expense_receipts_storage_delete" on storage.objects;
create policy "expense_receipts_storage_select" on storage.objects for select to authenticated using (bucket_id='expense-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "expense_receipts_storage_insert" on storage.objects for insert to authenticated with check (bucket_id='expense-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "expense_receipts_storage_update" on storage.objects for update to authenticated using (bucket_id='expense-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='expense-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "expense_receipts_storage_delete" on storage.objects for delete to authenticated using (bucket_id='expense-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
