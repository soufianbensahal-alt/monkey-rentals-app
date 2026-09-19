-- Run only after deploying notification-dispatch and creating Vault secrets
-- monkey_notification_url and monkey_notification_cron_secret.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Rerunnable without scheduling duplicate jobs.
do $$ declare job bigint; begin
  for job in select jobid from cron.job where jobname='monkey-notification-dispatch' loop perform cron.unschedule(job); end loop;
end $$;
select cron.schedule('monkey-notification-dispatch','* * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='monkey_notification_url'),
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='monkey_notification_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$job$);
