-- Push notifications were removed. In-app alerts are computed from fleet_state.state.events
-- in the browser and need none of these objects. Stops the per-minute Cron and frees storage:
-- its run history in cron.job_run_details was over half of the database.
do $$ declare job bigint; begin
  if to_regclass('cron.job') is not null then
    for job in select jobid from cron.job where jobname='monkey-notification-dispatch' loop
      delete from cron.job_run_details where jobid=job;
      perform cron.unschedule(job);
    end loop;
  end if;
end $$;

drop trigger if exists notification_cancel_stale on public.fleet_state;
drop table if exists public.notification_logs;
drop table if exists public.notification_deliveries;
drop table if exists public.notification_subscriptions;
drop table if exists public.notification_runtime;
drop function if exists public.notification_cancel_stale();
drop function if exists public.notification_log_attempt();
drop function if exists public.notification_claim(uuid,text,text,text,timestamptz);
drop function if exists public.notification_schedule(uuid,text,text,text,timestamptz);
drop function if exists public.notification_register_device(uuid,uuid,text,jsonb);
drop function if exists public.notification_session_active(uuid,uuid);
drop function if exists public.notification_server_config();
drop function if exists public.notification_initialize_vapid(text,text);

do $$ begin
  if to_regclass('vault.secrets') is not null then
    delete from vault.secrets where name in ('monkey_notification_url','monkey_notification_cron_secret','monkey_app_origin','monkey_vapid_subject','monkey_vapid_public_key','monkey_vapid_private_key');
  end if;
end $$;
