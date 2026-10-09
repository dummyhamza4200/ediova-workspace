-- Role-checked performance summaries and compatibility view for the previous UI.

DROP VIEW IF EXISTS public.manager_performance;
DROP VIEW IF EXISTS public.manager_monthly_performance;

CREATE OR REPLACE FUNCTION public.get_manager_performance()
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

REVOKE ALL ON FUNCTION public.get_manager_performance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_performance() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_manager_monthly_performance(p_month date)
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

REVOKE ALL ON FUNCTION public.get_manager_monthly_performance(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_monthly_performance(date) TO authenticated;

-- The current client uses the role-checked RPCs above.
-- Keep this security-invoker view so the already-published client remains compatible during rollout.
CREATE OR REPLACE VIEW public.manager_performance
WITH (security_invoker = true)
AS
SELECT p.id AS manager_id,
    p.full_name AS manager_name,
    p.location,
    count(t.id) FILTER (WHERE t.status <> ALL (ARRAY['cancelled'::task_status, 'archived'::task_status]))::integer AS assigned_tasks,
    count(t.id) FILTER (WHERE t.status = 'completed'::task_status)::integer AS completed_tasks,
    count(t.id) FILTER (WHERE (t.status <> ALL (ARRAY['cancelled'::task_status, 'archived'::task_status])) AND (t.status = 'completed'::task_status AND t.completed_at > t.deadline_at OR (t.status = ANY (ARRAY['pending'::task_status, 'in_progress'::task_status])) AND now() > t.deadline_at))::integer AS delayed_tasks,
    COALESCE(sum(
        CASE
            WHEN t.id IS NULL OR (t.status = ANY (ARRAY['cancelled'::task_status, 'archived'::task_status])) THEN 0
            WHEN t.status = 'completed'::task_status AND t.completed_at > t.deadline_at THEN floor(EXTRACT(epoch FROM t.completed_at - t.deadline_at) / 86400::numeric)::integer * 10
            WHEN (t.status = ANY (ARRAY['pending'::task_status, 'in_progress'::task_status])) AND now() > t.deadline_at THEN floor(EXTRACT(epoch FROM now() - t.deadline_at) / 86400::numeric)::integer * 10
            ELSE 0
        END), 0::bigint)::integer AS penalty_points,
    GREATEST(0::bigint, 100 - COALESCE(sum(
        CASE
            WHEN t.id IS NULL OR (t.status = ANY (ARRAY['cancelled'::task_status, 'archived'::task_status])) THEN 0
            WHEN t.status = 'completed'::task_status AND t.completed_at > t.deadline_at THEN floor(EXTRACT(epoch FROM t.completed_at - t.deadline_at) / 86400::numeric)::integer * 10
            WHEN (t.status = ANY (ARRAY['pending'::task_status, 'in_progress'::task_status])) AND now() > t.deadline_at THEN floor(EXTRACT(epoch FROM now() - t.deadline_at) / 86400::numeric)::integer * 10
            ELSE 0
        END), 0::bigint))::integer AS performance_score
   FROM profiles p
     LEFT JOIN tasks t ON t.assignee_id = p.id
  WHERE p.role = 'manager'::user_role
  GROUP BY p.id, p.full_name, p.location;;
REVOKE ALL ON TABLE public.manager_performance FROM anon;
GRANT SELECT ON TABLE public.manager_performance TO authenticated;
