-- Ediova Workspace initial schema
-- Run once in Supabase SQL Editor. Provision role rows through a trusted admin process only.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  role text not null check (role in ('manager', 'managing_director')),
  location text,
  experience text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  description text not null default '' check (char_length(description) <= 10000),
  scheduled_at timestamptz not null,
  deadline_at timestamptz not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  resource_url text,
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_deadline_after_schedule check (deadline_at > scheduled_at)
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tasks_assignee_schedule_idx on public.tasks (assignee_id, scheduled_at);
create index if not exists tasks_deadline_idx on public.tasks (deadline_at);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists task_comments_task_created_idx on public.task_comments (task_id, created_at);

create or replace function public.current_ediova_role()
returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() limit 1 $$;
revoke all on function public.current_ediova_role() from public;
grant execute on function public.current_ediova_role() to authenticated;

create or replace function public.touch_task_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at := now(); return new; end $$;

create or replace function public.guard_ediova_task_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if public.current_ediova_role() = 'manager' then
    if (to_jsonb(new) - array['status','completed_at','completed_by','updated_at'])
       is distinct from (to_jsonb(old) - array['status','completed_at','completed_by','updated_at']) then
      raise exception 'Managers may only update task status.' using errcode = '42501';
    end if;
    if old.status in ('completed','cancelled') or new.status not in ('in_progress','completed') then
      raise exception 'Managers may only start or complete open tasks.' using errcode = '42501';
    end if;
    if new.status = 'completed' then
      new.completed_at := now(); new.completed_by := auth.uid();
    else
      new.completed_at := null; new.completed_by := null;
    end if;
  elsif public.current_ediova_role() = 'managing_director' then
    if new.status = 'completed' and old.status <> 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, auth.uid());
    elsif new.status <> 'completed' then
      new.completed_at := null; new.completed_by := null;
    end if;
  else
    raise exception 'No Ediova role assigned.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.record_ediova_task_activity()
returns trigger language plpgsql security definer set search_path = public
as $$
declare ev text; det jsonb;
begin
  if tg_op = 'INSERT' then
    ev := 'task_created';
    det := jsonb_build_object('title', new.title, 'scheduled_at', new.scheduled_at, 'deadline_at', new.deadline_at);
  elsif new.status is distinct from old.status then
    ev := 'status_changed'; det := jsonb_build_object('from', old.status, 'to', new.status);
  else
    ev := 'task_updated'; det := jsonb_build_object('title', new.title);
  end if;
  insert into public.task_activity(task_id, actor_id, event_type, detail)
  values (new.id, auth.uid(), ev, coalesce(det, '{}'::jsonb));
  return new;
end $$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
drop trigger if exists tasks_guard_update on public.tasks;
drop trigger if exists tasks_activity_insert on public.tasks;
drop trigger if exists tasks_activity_update on public.tasks;
create trigger tasks_touch_updated_at before update on public.tasks for each row execute function public.touch_task_updated_at();
create trigger tasks_guard_update before update on public.tasks for each row execute function public.guard_ediova_task_update();
create trigger tasks_activity_insert after insert on public.tasks for each row execute function public.record_ediova_task_activity();
create trigger tasks_activity_update after update on public.tasks for each row execute function public.record_ediova_task_activity();

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_activity enable row level security;

drop policy if exists "Profiles readable to team" on public.profiles;
create policy "Profiles readable to team" on public.profiles for select to authenticated
using (auth.uid() is not null);

drop policy if exists "Tasks read by role and release" on public.tasks;
create policy "Tasks read by role and release" on public.tasks for select to authenticated
using (public.current_ediova_role() = 'managing_director'
  or (assignee_id = auth.uid() and scheduled_at <= now()));

drop policy if exists "Director creates tasks" on public.tasks;
create policy "Director creates tasks" on public.tasks for insert to authenticated
with check (public.current_ediova_role() = 'managing_director' and created_by = auth.uid());

drop policy if exists "Director edits and Manager status update" on public.tasks;
create policy "Director edits and Manager status update" on public.tasks for update to authenticated
using (public.current_ediova_role() = 'managing_director'
  or (public.current_ediova_role() = 'manager' and assignee_id = auth.uid() and scheduled_at <= now()))
with check (public.current_ediova_role() = 'managing_director'
  or (public.current_ediova_role() = 'manager' and assignee_id = auth.uid() and scheduled_at <= now()
      and status in ('in_progress','completed')));

drop policy if exists "Comments read with task access" on public.task_comments;
create policy "Comments read with task access" on public.task_comments for select to authenticated
using (public.current_ediova_role() = 'managing_director' or exists (
  select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid() and t.scheduled_at <= now()
));

drop policy if exists "Comments add with task access" on public.task_comments;
create policy "Comments add with task access" on public.task_comments for insert to authenticated
with check (author_id = auth.uid() and (
  public.current_ediova_role() = 'managing_director' or exists (
    select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid()
      and t.scheduled_at <= now() and t.status <> 'cancelled'
  )
));

drop policy if exists "Activity read with task access" on public.task_activity;
create policy "Activity read with task access" on public.task_activity for select to authenticated
using (public.current_ediova_role() = 'managing_director' or exists (
  select 1 from public.tasks t where t.id = task_id and t.assignee_id = auth.uid() and t.scheduled_at <= now()
));

grant select on public.profiles to authenticated;
grant select, insert, update on public.tasks to authenticated;
grant select, insert on public.task_comments to authenticated;
grant select on public.task_activity to authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke delete on public.tasks, public.task_comments, public.task_activity from anon, authenticated;
revoke insert, update, delete on public.task_activity from anon, authenticated;

-- To provision users, create/invite each account through Supabase Auth first, then insert its
-- profile row from SQL Editor using the real auth.users UUID and the appropriate trusted role.
