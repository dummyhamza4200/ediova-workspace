-- Automatically move tasks into progress when their scheduled release time arrives.
-- Keep schedule_at unchanged so the original schedule and deadline remain accurate.
CREATE OR REPLACE FUNCTION public.auto_start_ediova_scheduled_tasks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  started_count integer := 0;
BEGIN
  UPDATE public.tasks
     SET status = 'in_progress'
   WHERE status = 'pending'
     AND schedule_at <= now();

  GET DIAGNOSTICS started_count = ROW_COUNT;
  RETURN started_count;
END;
$function$;

-- The function is intended to be called by the postgres-owned pg_cron job only.
REVOKE ALL ON FUNCTION public.auto_start_ediova_scheduled_tasks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_start_ediova_scheduled_tasks() FROM anon, authenticated;

DO $schedule$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'ediova-auto-start-scheduled-tasks'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'ediova-auto-start-scheduled-tasks',
    '* * * * *',
    'select public.auto_start_ediova_scheduled_tasks();'
  );
END;
$schedule$;
