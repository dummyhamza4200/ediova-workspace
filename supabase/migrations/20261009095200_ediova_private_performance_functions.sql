
-- Keep SECURITY DEFINER calculations in the non-exposed app_private schema.
-- Public RPCs are SECURITY INVOKER wrappers; access and requested data are checked by the private functions.
CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.get_manager_performance()
 RETURNS TABLE(manager_id uuid, manager_name text, location text, assigned_tasks integer, completed_tasks integer, delayed_tasks integer, penalty_points integer, performance_score integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE caller_role public.user_role;
BEGIN
  caller_role := public.current_app_role();
  IF auth.uid() IS NULL OR caller_role IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.location,
    count(t.id) FILTER (WHERE t.status <> ALL (ARRAY['cancelled'::public.task_status,'archived'::public.task_status]))::integer,
    count(t.id) FILTER (WHERE t.status='completed'::public.task_status)::integer,
    count(t.id) FILTER (WHERE t.status <> ALL (ARRAY['cancelled'::public.task_status,'archived'::public.task_status]) AND ((t.status='completed'::public.task_status AND t.completed_at>t.deadline_at) OR (t.status=ANY(ARRAY['pending'::public.task_status,'in_progress'::public.task_status]) AND now()>t.deadline_at)))::integer,
    coalesce(sum(CASE
      WHEN t.id IS NULL OR t.status=ANY(ARRAY['cancelled'::public.task_status,'archived'::public.task_status]) THEN 0
      WHEN t.status='completed'::public.task_status AND t.completed_at>t.deadline_at THEN floor(EXTRACT(epoch FROM (t.completed_at-t.deadline_at))/86400)::integer*10
      WHEN t.status=ANY(ARRAY['pending'::public.task_status,'in_progress'::public.task_status]) AND now()>t.deadline_at THEN floor(EXTRACT(epoch FROM (now()-t.deadline_at))/86400)::integer*10
      ELSE 0 END),0)::integer,
    greatest(0,100-coalesce(sum(CASE
      WHEN t.id IS NULL OR t.status=ANY(ARRAY['cancelled'::public.task_status,'archived'::public.task_status]) THEN 0
      WHEN t.status='completed'::public.task_status AND t.completed_at>t.deadline_at THEN floor(EXTRACT(epoch FROM (t.completed_at-t.deadline_at))/86400)::integer*10
      WHEN t.status=ANY(ARRAY['pending'::public.task_status,'in_progress'::public.task_status]) AND now()>t.deadline_at THEN floor(EXTRACT(epoch FROM (now()-t.deadline_at))/86400)::integer*10
      ELSE 0 END),0))::integer
  FROM public.profiles p LEFT JOIN public.tasks t ON t.assignee_id=p.id
  WHERE p.role='manager'::public.user_role
    AND (caller_role='managing_director'::public.user_role OR p.id=auth.uid())
  GROUP BY p.id,p.full_name,p.location;
END
$function$;
CREATE OR REPLACE FUNCTION app_private.get_manager_monthly_performance(p_month date)
 RETURNS TABLE(manager_id uuid, manager_name text, location text, month_start date, completed_tasks integer, completed_hours numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE caller_role public.user_role; month_begin timestamptz; month_end timestamptz; selected_month date;
BEGIN
  caller_role := public.current_app_role();
  IF auth.uid() IS NULL OR caller_role IS NULL OR p_month IS NULL THEN RETURN; END IF;
  selected_month := date_trunc('month',p_month::timestamp)::date;
  month_begin := selected_month::timestamp AT TIME ZONE 'Asia/Karachi';
  month_end := (selected_month + interval '1 month')::timestamp AT TIME ZONE 'Asia/Karachi';
  RETURN QUERY
  SELECT p.id,p.full_name,p.location,selected_month,count(t.id)::integer,coalesce(sum(h.target_hours),0)::numeric(9,2)
  FROM public.profiles p
  LEFT JOIN public.tasks t ON t.assignee_id=p.id AND t.status='completed'::public.task_status AND t.completed_at>=month_begin AND t.completed_at<month_end
  LEFT JOIN public.task_hour_targets h ON h.task_id=t.id
  WHERE p.role='manager'::public.user_role AND (caller_role='managing_director'::public.user_role OR p.id=auth.uid())
  GROUP BY p.id,p.full_name,p.location;
END
$function$;

REVOKE ALL ON FUNCTION app_private.get_manager_performance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.get_manager_performance() TO authenticated;
REVOKE ALL ON FUNCTION app_private.get_manager_monthly_performance(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.get_manager_monthly_performance(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_manager_performance()
RETURNS TABLE (
  manager_id uuid, manager_name text, location text, assigned_tasks integer,
  completed_tasks integer, delayed_tasks integer, penalty_points integer, performance_score integer
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
  SELECT * FROM app_private.get_manager_performance();
$function$;

CREATE OR REPLACE FUNCTION public.get_manager_monthly_performance(p_month date)
RETURNS TABLE (
  manager_id uuid, manager_name text, location text, month_start date,
  completed_tasks integer, completed_hours numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
  SELECT * FROM app_private.get_manager_monthly_performance(p_month);
$function$;

REVOKE ALL ON FUNCTION public.get_manager_performance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_performance() TO authenticated;
REVOKE ALL ON FUNCTION public.get_manager_monthly_performance(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_monthly_performance(date) TO authenticated;

REVOKE ALL ON TABLE public.manager_performance FROM anon, authenticated;
GRANT SELECT ON TABLE public.manager_performance TO authenticated;
