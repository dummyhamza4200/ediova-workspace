-- Use the restricted app_private role helper in the private task-hour policy.
-- The public.is_managing_director() function is intentionally not executable by authenticated users.
drop policy if exists task_hour_targets_director_only on public.task_hour_targets;

create policy task_hour_targets_director_only
  on public.task_hour_targets
  for all
  to authenticated
  using (app_private.is_managing_director())
  with check (
    app_private.is_managing_director()
    and set_by = (select auth.uid())
  );
