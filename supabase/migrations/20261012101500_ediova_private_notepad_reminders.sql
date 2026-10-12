-- Private per-user Notepad notes and dated reminders for Ediova Workspace.
create table if not exists public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 5000),
  reminder_date date,
  completed_at timestamptz,
  popup_dismissed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_notes_owner_reminder_idx
  on public.user_notes (user_id, reminder_date)
  where completed_at is null;

alter table public.user_notes enable row level security;

drop policy if exists user_notes_select_own on public.user_notes;
create policy user_notes_select_own on public.user_notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_notes_insert_own on public.user_notes;
create policy user_notes_insert_own on public.user_notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_notes_update_own on public.user_notes;
create policy user_notes_update_own on public.user_notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_notes_delete_own on public.user_notes;
create policy user_notes_delete_own on public.user_notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_notes from anon;
grant select, insert, update, delete on table public.user_notes to authenticated;

create or replace function public.touch_user_notes_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_notes_touch_updated_at on public.user_notes;
create trigger user_notes_touch_updated_at
  before update on public.user_notes
  for each row execute function public.touch_user_notes_updated_at();
