-- Task-hour privacy and selected-weekday recurrence for Ediova Workspace.
-- Based on the current production schema; do not apply the old starter migration.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS repeat_weekdays smallint[] NOT NULL DEFAULT '{}'::smallint[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_repeat_weekdays_valid'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_repeat_weekdays_valid
      CHECK (repeat_weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.task_hour_targets (
  task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE CASCADE,
  target_hours numeric(7,2) NOT NULL CHECK (target_hours >= 0.25 AND target_hours <= 1000),
  set_by uuid NOT NULL REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_hour_targets_set_by_idx
  ON public.task_hour_targets(set_by);

ALTER TABLE public.task_hour_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.task_hour_targets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_hour_targets TO authenticated;

DROP POLICY IF EXISTS task_hour_targets_director_only ON public.task_hour_targets;
CREATE POLICY task_hour_targets_director_only
  ON public.task_hour_targets
  FOR ALL TO authenticated
  USING (public.is_managing_director())
  WITH CHECK (public.is_managing_director() AND set_by = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION app_private.inherit_recurring_task_hour_target()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.recurrence_parent_id IS NOT NULL THEN
    INSERT INTO public.task_hour_targets (task_id, target_hours, set_by)
    SELECT NEW.id, h.target_hours, h.set_by
    FROM public.task_hour_targets h
    WHERE h.task_id = NEW.recurrence_parent_id
    ON CONFLICT (task_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION app_private.propagate_series_task_hour_target()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tasks p
    WHERE p.id = NEW.task_id
      AND p.recurrence_parent_id IS NULL
      AND p.repeat_unit <> 'none'
  ) THEN
    INSERT INTO public.task_hour_targets (task_id, target_hours, set_by, updated_at)
    SELECT child.id, NEW.target_hours, NEW.set_by, now()
    FROM public.tasks child
    WHERE child.recurrence_parent_id = NEW.task_id
      AND child.status NOT IN ('completed', 'cancelled', 'archived')
    ON CONFLICT (task_id) DO UPDATE
      SET target_hours = EXCLUDED.target_hours,
          set_by = EXCLUDED.set_by,
          updated_at = now();
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION app_private.remove_open_series_task_hour_targets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tasks p
    WHERE p.id = OLD.task_id
      AND p.recurrence_parent_id IS NULL
      AND p.repeat_unit <> 'none'
  ) THEN
    DELETE FROM public.task_hour_targets h
    USING public.tasks child
    WHERE h.task_id = child.id
      AND child.recurrence_parent_id = OLD.task_id
      AND child.status NOT IN ('completed', 'cancelled', 'archived');
  END IF;
  RETURN OLD;
END
$function$;


REVOKE ALL ON FUNCTION app_private.inherit_recurring_task_hour_target() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.propagate_series_task_hour_target() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.remove_open_series_task_hour_targets() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS task_inherit_hour_target ON public.tasks;
CREATE TRIGGER task_inherit_hour_target
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION app_private.inherit_recurring_task_hour_target();

DROP TRIGGER IF EXISTS task_hour_target_propagate ON public.task_hour_targets;
CREATE TRIGGER task_hour_target_propagate
  AFTER INSERT OR UPDATE ON public.task_hour_targets
  FOR EACH ROW EXECUTE FUNCTION app_private.propagate_series_task_hour_target();

DROP TRIGGER IF EXISTS task_hour_target_remove_series ON public.task_hour_targets;
CREATE TRIGGER task_hour_target_remove_series
  AFTER DELETE ON public.task_hour_targets
  FOR EACH ROW EXECUTE FUNCTION app_private.remove_open_series_task_hour_targets();

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
BEGIN
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
        IF EXTRACT(DAY FROM candidate_day)::integer = series.repeat_day_one
          OR (series.repeat_monthly_count = 2 AND EXTRACT(DAY FROM candidate_day)::integer = series.repeat_day_two)
        THEN
          occurrence_at := ((candidate_day::timestamp + local_time) AT TIME ZONE 'Asia/Karachi');
          IF occurrence_at <= series.schedule_at OR occurrence_at <= now()
            OR occurrence_at > now() + interval '62 days'
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
          OR occurrence_at > now() + interval '62 days'
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
        EXIT WHEN occurrence_at > now() + interval '62 days';
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

