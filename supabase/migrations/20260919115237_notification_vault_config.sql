-- Server-only access to notification configuration. Private values never reach the browser.
create function public.notification_server_config() returns jsonb
language sql security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(upper(replace(name,'monkey_','')),decrypted_secret),'{}'::jsonb)
  from vault.decrypted_secrets where name in ('monkey_app_origin','monkey_vapid_subject','monkey_vapid_public_key','monkey_vapid_private_key','monkey_notification_cron_secret');
$$;
revoke all on function public.notification_server_config() from public,anon,authenticated;
grant execute on function public.notification_server_config() to service_role;

create function public.notification_initialize_vapid(public_key text,private_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtext('monkey_notification_vapid'));
  if not exists(select 1 from vault.secrets where name='monkey_vapid_private_key') then
    perform vault.create_secret(public_key,'monkey_vapid_public_key');
    perform vault.create_secret(private_key,'monkey_vapid_private_key');
  end if;
  return public.notification_server_config();
end;
$$;
revoke all on function public.notification_initialize_vapid(text,text) from public,anon,authenticated;
grant execute on function public.notification_initialize_vapid(text,text) to service_role;

do $$
begin
  if not exists(select 1 from vault.secrets where name='monkey_notification_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'monkey_notification_cron_secret');
  end if;
  if not exists(select 1 from vault.secrets where name='monkey_app_origin') then
    perform vault.create_secret('https://monkey-rentals-app.vercel.app','monkey_app_origin');
    perform vault.create_secret('https://monkey-rentals-app.vercel.app','monkey_vapid_subject');
  end if;
end;
$$;
