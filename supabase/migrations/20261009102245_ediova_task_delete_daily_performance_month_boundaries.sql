CREATE POLICY tasks_delete_director
  ON public.tasks
  FOR DELETE
  TO authenticated
  USING (app_private.is_managing_director());

CREATE OR REPLACE FUNCTION app_private.get_manager_daily_performance(p_date date)
RETURNS TABLE(
  manager_id uuid,
  manager_name text,
  location text,
  selected_date date,
  completed_tasks integer,
  completed_hours numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  caller_role public.user_role;
  day_begin timestamptz;
  day_end timestamptz;
  selected_day date;
BEGIN
  caller_role := public.current_app_role();
  IF auth.uid() IS NULL OR caller_role IS NULL OR p_date IS NULL THEN
    RETURN;
  END IF;

  selected_day := p_date;
  day_begin := selected_day::timestamp AT TIME ZONE 'Asia/Karachi';
  day_end := (selected_day + 1)::timestamp AT TIME ZONE 'Asia/Karachi';

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.location,
    selected_day,
    count(t.id)::integer,
    coalesce(sum(h.target_hours), 0)::numeric(9,2)
  FROM public.profiles p
  LEFT JOIN public.tasks t
    ON t.assignee_id = p.id
    AND t.status = 'completed'::public.task_status
    AND t.completed_at >= day_begin
    AND t.completed_at < day_end
  LEFT JOIN public.task_hour_targets h ON h.task_id = t.id
  WHERE p.role = 'manager'::public.user_role
    AND (caller_role = 'managing_director'::public.user_role OR p.id = auth.uid())
  GROUP BY p.id, p.full_name, p.location;
END
$function$;

REVOKE ALL ON FUNCTION app_private.get_manager_daily_performance(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.get_manager_daily_performance(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_manager_daily_performance(p_date date)
RETURNS TABLE(
  manager_id uuid,
  manager_name text,
  location text,
  selected_date date,
  completed_tasks integer,
  completed_hours numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
  SELECT * FROM app_private.get_manager_daily_performance(p_date);
$function$;

REVOKE ALL ON FUNCTION public.get_manager_daily_performance(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manager_daily_performance(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_ediova_recurring_tasks()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  series record;
  interval_step interval;
  occurrence_n integer;
  occurrence_at timestamptz;
  deadline_offset interval;
  inserted_rows integer;
  generated_total integer := 0;
  local_day date;
  local_time time;
  day_index integer;
  candidate_day date;
  anchor_monday date;
  week_delta integer;
  month_end timestamptz;
BEGIN
  month_end := (date_trunc('month', now() AT TIME ZONE 'Asia/Karachi') + interval '1 month') AT TIME ZONE 'Asia/Karachi';
  FOR series IN
    SELECT * FROM public.tasks
    WHERE recurrence_parent_id IS NULL
      AND repeat_unit <> 'none'
      AND status NOT IN ('cancelled','archived')
    ORDER BY created_at
  LOOP
    deadline_offset := series.deadline_at - series.schedule_at;

    IF series.repeat_unit = 'monthly' THEN
      IF series.repeat_day_one IS NULL THEN
        UPDATE public.tasks SET repeat_day_one =
          EXTRACT(DAY FROM (series.schedule_at AT TIME ZONE 'Asia/Karachi'))::smallint
        WHERE id = series.id;
        series.repeat_day_one := EXTRACT(DAY FROM (series.schedule_at AT TIME ZONE 'Asia/Karachi'))::smallint;
      END IF;
      local_time := (series.schedule_at AT TIME ZONE 'Asia/Karachi')::time;
      local_day := (now() AT TIME ZONE 'Asia/Karachi')::date;
      FOR day_index IN 0..61 LOOP
        candidate_day := local_day + day_index;
        IF candidate_day >= (month_end AT TIME ZONE 'Asia/Karachi')::date THEN CONTINUE; END IF;
        IF EXTRACT(DAY FROM candidate_day)::integer = series.repeat_day_one
          OR (series.repeat_monthly_count = 2 AND EXTRACT(DAY FROM candidate_day)::integer = series.repeat_day_two)
        THEN
          occurrence_at := ((candidate_day::timestamp + local_time) AT TIME ZONE 'Asia/Karachi');
          IF occurrence_at <= series.schedule_at OR occurrence_at <= now()
            OR occurrence_at >= month_end
            OR (series.repeat_until IS NOT NULL AND occurrence_at > series.repeat_until)
          THEN
            CONTINUE;
          END IF;
          INSERT INTO public.tasks (
            title, description, schedule_at, deadline_at, assignee_id, created_by,
            priority, status, links, notes, repeat_unit, repeat_every, repeat_until,
            recurrence_parent_id, repeat_monthly_count, repeat_day_one, repeat_day_two
          ) VALUES (
            series.title, series.description, occurrence_at, occurrence_at + deadline_offset,
            series.assignee_id, series.created_by, series.priority, 'pending', series.links,
            series.notes, 'none', 1, NULL, series.id, 1, NULL, NULL
          )
          ON CONFLICT (recurrence_parent_id, schedule_at) WHERE recurrence_parent_id IS NOT NULL DO NOTHING;
          GET DIAGNOSTICS inserted_rows = ROW_COUNT;
          generated_total := generated_total + inserted_rows;
        END IF;
      END LOOP;
    ELSIF series.repeat_unit = 'weekly'
      AND cardinality(COALESCE(series.repeat_weekdays, ARRAY[]::smallint[])) > 0 THEN
      local_time := (series.schedule_at AT TIME ZONE 'Asia/Karachi')::time;
      local_day := (now() AT TIME ZONE 'Asia/Karachi')::date;
      anchor_monday := date_trunc('week', (series.schedule_at AT TIME ZONE 'Asia/Karachi')::date)::date;
      FOR day_index IN 0..61 LOOP
        candidate_day := local_day + day_index;
        IF candidate_day >= (month_end AT TIME ZONE 'Asia/Karachi')::date THEN CONTINUE; END IF;
        IF candidate_day < anchor_monday THEN
          CONTINUE;
        END IF;
        week_delta := (candidate_day - anchor_monday) / 7;
        IF week_delta % GREATEST(series.repeat_every, 1) <> 0
          OR NOT (EXTRACT(ISODOW FROM candidate_day)::smallint = ANY(series.repeat_weekdays))
        THEN
          CONTINUE;
        END IF;
        occurrence_at := ((candidate_day::timestamp + local_time) AT TIME ZONE 'Asia/Karachi');
        IF occurrence_at <= series.schedule_at OR occurrence_at <= now()
          OR occurrence_at >= month_end
          OR (series.repeat_until IS NOT NULL AND occurrence_at > series.repeat_until)
        THEN
          CONTINUE;
        END IF;
        INSERT INTO public.tasks (
          title, description, schedule_at, deadline_at, assignee_id, created_by,
          priority, status, links, notes, repeat_unit, repeat_every, repeat_until,
          recurrence_parent_id, repeat_monthly_count, repeat_day_one, repeat_day_two
        ) VALUES (
          series.title, series.description, occurrence_at, occurrence_at + deadline_offset,
          series.assignee_id, series.created_by, series.priority, 'pending', series.links,
          series.notes, 'none', 1, NULL, series.id, 1, NULL, NULL
        )
        ON CONFLICT (recurrence_parent_id, schedule_at) WHERE recurrence_parent_id IS NOT NULL DO NOTHING;
        GET DIAGNOSTICS inserted_rows = ROW_COUNT;
        generated_total := generated_total + inserted_rows;
      END LOOP;
    ELSE
      IF series.repeat_unit = 'daily' THEN
        interval_step := make_interval(days => series.repeat_every);
      ELSE
        interval_step := make_interval(days => 7 * series.repeat_every);
      END IF;
      occurrence_n := GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (now() - series.schedule_at))
        / EXTRACT(EPOCH FROM interval_step))::integer + 1);
      LOOP
        occurrence_at := series.schedule_at + interval_step * occurrence_n;
        EXIT WHEN occurrence_at >= month_end;
        EXIT WHEN series.repeat_until IS NOT NULL AND occurrence_at > series.repeat_until;
        INSERT INTO public.tasks (
          title, description, schedule_at, deadline_at, assignee_id, created_by,
          priority, status, links, notes, repeat_unit, repeat_every, repeat_until,
          recurrence_parent_id, repeat_monthly_count, repeat_day_one, repeat_day_two
        ) VALUES (
          series.title, series.description, occurrence_at, occurrence_at + deadline_offset,
          series.assignee_id, series.created_by, series.priority, 'pending', series.links,
          series.notes, 'none', 1, NULL, series.id, 1, NULL, NULL
        )
        ON CONFLICT (recurrence_parent_id, schedule_at) WHERE recurrence_parent_id IS NOT NULL DO NOTHING;
        GET DIAGNOSTICS inserted_rows = ROW_COUNT;
        generated_total := generated_total + inserted_rows;
        occurrence_n := occurrence_n + 1;
      END LOOP;
    END IF;
  END LOOP;
  RETURN generated_total;
END
$function$;