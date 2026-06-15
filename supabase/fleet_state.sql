create table if not exists public.fleet_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fleet_state enable row level security;

drop policy if exists "fleet_state_authenticated_select" on public.fleet_state;
drop policy if exists "fleet_state_authenticated_insert" on public.fleet_state;
drop policy if exists "fleet_state_authenticated_update" on public.fleet_state;

create policy "fleet_state_authenticated_select"
on public.fleet_state
for select
to authenticated
using (id = 'monkey-rentals');

create policy "fleet_state_authenticated_insert"
on public.fleet_state
for insert
to authenticated
with check (id = 'monkey-rentals');

create policy "fleet_state_authenticated_update"
on public.fleet_state
for update
to authenticated
using (id = 'monkey-rentals')
with check (id = 'monkey-rentals');
