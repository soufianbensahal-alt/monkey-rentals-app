-- Manual reminders remain in fleet_state.state.events, the existing owner-scoped
-- source of truth. No duplicate writable alerts table or cross-device dual writes.
create table public.notification_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references auth.sessions(id) on delete cascade,
  endpoint text not null unique check (length(endpoint)<=4096),
  keys jsonb not null,
  created_at timestamptz not null default now()
);
create index notification_subscriptions_owner on public.notification_subscriptions(user_id);
create table public.notification_deliveries (
  delivery_key text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.notification_subscriptions(id) on delete set null,
  event_id text not null,
  revision text not null,
  scheduled_at timestamptz not null,
  claimed_at timestamptz not null default now(),
  status text not null default 'claimed' check(status in ('claimed','sent','failed','cancelled')),
  notification_sent boolean not null default false,
  notification_sent_at timestamptz,
  error_code text
);
create index notification_deliveries_owner_time on public.notification_deliveries(user_id,scheduled_at desc);
alter table public.notification_subscriptions enable row level security;
alter table public.notification_subscriptions force row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_deliveries force row level security;
revoke all on public.notification_subscriptions,public.notification_deliveries from public,anon,authenticated;
grant select on public.notification_subscriptions,public.notification_deliveries to authenticated;
grant all on public.notification_subscriptions,public.notification_deliveries to service_role;
create policy notification_devices_owner on public.notification_subscriptions for select to authenticated using ((select auth.uid())=user_id);
create policy notification_deliveries_owner on public.notification_deliveries for select to authenticated using ((select auth.uid())=user_id);

-- These RPCs are service-role only, never callable by browsers.
create function public.notification_session_active(owner uuid, session uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.sessions where id=session and user_id=owner and (not_after is null or not_after>now()));
$$;
revoke all on function public.notification_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_session_active(uuid,uuid) to service_role;

create function public.notification_register_device(owner uuid, session uuid,p_endpoint text,p_keys jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.notification_session_active(owner,session) then raise exception 'Invalid session'; end if;
  if exists(select 1 from public.notification_subscriptions where endpoint=p_endpoint and user_id<>owner) then raise exception 'Device belongs to another account'; end if;
  if (select count(*) from public.notification_subscriptions where user_id=owner)>=10 and not exists(select 1 from public.notification_subscriptions where endpoint=p_endpoint and user_id=owner) then raise exception 'Device limit reached'; end if;
  insert into public.notification_subscriptions(user_id,session_id,endpoint,keys) values(owner,session,p_endpoint,p_keys)
    on conflict(endpoint) do update set session_id=excluded.session_id,keys=excluded.keys where notification_subscriptions.user_id=owner;
end;
$$;
revoke all on function public.notification_register_device(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.notification_register_device(uuid,uuid,text,jsonb) to service_role;

create function public.notification_claim(p_device uuid,p_event text,p_revision text,p_key text,p_scheduled timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare device public.notification_subscriptions; current_state jsonb; event jsonb; inserted integer;
begin
  select * into device from public.notification_subscriptions where id=p_device;
  if device.id is null or not public.notification_session_active(device.user_id,device.session_id) then return false; end if;
  select state into current_state from public.fleet_state where user_id=device.user_id;
  select item into event from jsonb_array_elements(coalesce(current_state->'events','[]')) item where item->>'id'=p_event limit 1;
  if event is null or event->>'revision' is distinct from p_revision or event->>'status' in ('completed','cancelled') then return false; end if;
  if current_state#>>'{adminSettings,notifications,enabled}' is distinct from 'true' or not coalesce((current_state#>'{adminSettings,notifications,categories}') ? (event->>'type'),false) then return false; end if;
  if p_scheduled>now()+interval '1 minute' or p_scheduled<now()-interval '24 hours' then return false; end if;
  insert into public.notification_deliveries(delivery_key,user_id,device_id,event_id,revision,scheduled_at)
    values(p_key,device.user_id,device.id,p_event,p_revision,p_scheduled) on conflict do nothing;
  get diagnostics inserted=row_count;
  return inserted=1;
end;
$$;
revoke all on function public.notification_claim(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.notification_claim(uuid,text,text,text,timestamptz) to service_role;

-- Immediately cancel jobs whose event was edited, deleted or completed.
create function public.notification_cancel_stale() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.notification_deliveries d set status='cancelled'
  where d.user_id=new.user_id and d.status='claimed' and not exists(
    select 1 from jsonb_array_elements(coalesce(new.state->'events','[]')) e
    where e->>'id'=d.event_id and e->>'revision'=d.revision and coalesce(e->>'status','active')='active'
  );
  return new;
end;
$$;
revoke all on function public.notification_cancel_stale() from public,anon,authenticated;
create trigger notification_cancel_stale after update of state on public.fleet_state for each row execute function public.notification_cancel_stale();

-- Health signal: do not report the push service as ready until Cron has run.
create table public.notification_runtime(id integer primary key check(id=1),last_success timestamptz);
insert into public.notification_runtime(id) values(1);
alter table public.notification_runtime enable row level security;
revoke all on public.notification_runtime from public,anon,authenticated;
grant all on public.notification_runtime to service_role;
