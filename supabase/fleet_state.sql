create table if not exists public.fleet_state (
  id text primary key,
  user_id uuid,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fleet_state
  add column if not exists user_id uuid;

create unique index if not exists fleet_state_user_id_key
  on public.fleet_state (user_id);

alter table public.fleet_state enable row level security;
alter table public.fleet_state force row level security;

drop policy if exists "fleet_state_authenticated_select" on public.fleet_state;
drop policy if exists "fleet_state_authenticated_insert" on public.fleet_state;
drop policy if exists "fleet_state_authenticated_update" on public.fleet_state;
drop policy if exists "fleet_state_authenticated_delete" on public.fleet_state;

create policy "fleet_state_authenticated_select"
on public.fleet_state
for select
to authenticated
using (auth.uid() = user_id);

create policy "fleet_state_authenticated_insert"
on public.fleet_state
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "fleet_state_authenticated_update"
on public.fleet_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "fleet_state_authenticated_delete"
on public.fleet_state
for delete
to authenticated
using (auth.uid() = user_id);
