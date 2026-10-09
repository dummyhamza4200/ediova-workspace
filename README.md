# Ediova Workspace

Ediova's website and private, two-role team task workspace. Built with React, TypeScript, Vite and Supabase.

## What's in this repository

- Public-facing landing page with animated creative project cards, Careers contact link and team login.
- Exactly two access roles: **01 Manager** and **02 Managing Director**.
- Manager workspace: released assigned tasks, deadlines and overdue states, links, comments, calendar, completed history and a flippable profile card for Umna Haroon.
- Director workspace: create, schedule, edit and assign tasks, set priorities and deadlines, review task status, comments and calendar.
- Default timezone: **Asia/Karachi (UTC+05:00)**.
- Supabase schema and row-level security policies for shared task persistence.
- GitHub Actions build workflow and an optional Pages deployment step.

The official Ediova logo was not provided in this connected context. The SVG mark and coral / ink / lilac / sage palette are **provisional**; replace and tune them against the official brand asset before launch.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Without Supabase environment variables the site opens in **Preview mode** with sample tasks. Preview changes persist only in the current browser and are **not shared** with another user or device. Use this mode for interface evaluation, not real task management.

## Configure real authentication and shared tasks

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/migrations/202610090001_initial_schema.sql`.
3. In Supabase Authentication, create/invite one account for Umna Haroon (Manager) and one for the Managing Director. Disable public sign-up.
4. Copy each account's real Auth user UUID.
5. As a trusted administrator in SQL Editor, provision their profile rows with those UUIDs (replace both placeholders first):

```sql
insert into public.profiles (id, full_name, role, location, experience)
values
  ('REPLACE_WITH_UMNA_AUTH_UUID', 'Umna Haroon', 'manager', 'Islamabad, Pakistan', '2+ years'),
  ('REPLACE_WITH_DIRECTOR_AUTH_UUID', 'Managing Director', 'managing_director', null, null);
```

If a profile row already exists, update it rather than inserting a duplicate. The role must be granted by a trusted administrator, never by the browser user.

6. In the local environment, copy `.env.example` to `.env.local` and enter your project's URL and public anon/publishable key.
7. For a hosted build, add repository **Actions secrets** named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
8. Test both accounts. Confirm Managers cannot read tasks before release, edit task content or deadlines, assign work, or access Director functions. Confirm updates and comments persist across devices.

**Never** place a Supabase service-role key in frontend code or any `VITE_*` variable. Browser environment values are public; database row-level security is the authorization boundary.

## Build and type-check

```bash
npm run typecheck
npm run build
npm run preview
```

## GitHub Actions and Pages

Every push to `main` runs the TypeScript check and production build. A build artifact is retained for inspection/download.

To publish with GitHub Pages:

1. Open **Settings → Pages** and enable **GitHub Actions** as the source.
2. Add the two Supabase Actions secrets only after configuring Supabase.
3. Add a repository Actions **variable** named `ENABLE_GITHUB_PAGES` with value `true`.

The connection used in the assistant session can push repository files but cannot enable the Pages site through GitHub's Pages settings API. That one-time setting must be completed in the repository UI. Do not make this private repository public just to work around it; if Pages is unavailable for the current plan, keep the repo private and use an approved hosting provider.

## Production checklist

- Replace the provisional logo and verify all colors against Ediova's official brand asset.
- Apply the SQL migration and create the two real Auth accounts.
- Validate RLS and schedule/deadline behavior for both roles in Asia/Karachi time.
- Configure a trusted backup and retention plan, and review monitoring.
- Replace draft privacy and company-policy copy with language matching actual business practices.
- Do not put client secrets or sensitive client data into task descriptions/comments unless the chosen hosting and retention policy explicitly supports it.
