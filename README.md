# Ediova Workspace

Ediova's website and two-role team task workspace. Built with React, TypeScript, Vite and Supabase.

## What's in this repository

- Public-facing landing page with animated creative project cards, Careers contact link and team login.
- Exactly two access roles: **01 Manager** and **02 Managing Director**.
- Manager workspace: released assigned tasks, deadlines and overdue states, links, comments, calendar, completed history and a flippable profile card for Umna Haroon.
- Director workspace: create, schedule, edit and assign tasks, set priorities and deadlines, review task status, comments and calendar.
- Default timezone: **Asia/Karachi (UTC+05:00)**.
- Supabase schema and row-level security policies for shared task persistence.
- GitHub Actions build workflow, production artifact upload, and optional deployment via GitHub Pages.

The official Ediova logo was not provided in this connected context. The SVG mark and coral / ink / lilac / sage palette are **provisional**; replace and tune them against the official brand asset before launch.

## Run locally

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Without Supabase environment variables the site opens in **Preview mode** with sample tasks. Preview changes persist only in the current browser and are **not shared** with another user or device. Use this mode for interface evaluation, not real task management.

## Configure real authentication and shared tasks

1. Create or select a Supabase project.
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
7. For a hosted build, add the public Supabase URL and anon/publishable key as the hosting provider's environment variables. For GitHub Actions, use repository **Actions secrets** named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
8. Test both accounts. Confirm Managers cannot read tasks before release, edit task content or deadlines, assign work, or access Director functions. Confirm updates and comments persist across devices.

**Never** place a Supabase service-role key in frontend code or any `VITE_*` variable. Browser environment values are public; database row-level security is the authorization boundary.

## Build and type-check

```bash
npm run typecheck
npm run build
npm run preview
```

## Deploy to Vercel

A `vercel.json` configuration is included for the Vite SPA build and basic security headers.

1. In Vercel, import this Git repository as a new project.
2. Keep the framework preset as Vite (the configuration also sets the build command and `dist` output directory).
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Project Settings → Environment Variables** for Preview and Production.
4. Deploy. Confirm the landing page, login screen and authenticated views load correctly.
5. Do not publish real task information until the Supabase migration, accounts and RLS checks are completed.

Vercel account/team authorization is required to create a deployment; repository code alone cannot activate a Vercel project.

## GitHub Actions and Pages

Every push to `main` runs TypeScript checking and the production build. A `ediova-workspace-dist` artifact is retained for inspection/download.

To publish with GitHub Pages:

1. Open **Settings → Pages** and enable **GitHub Actions** as the source.
2. Add the two Supabase Actions secrets only after configuring Supabase.
3. Add a repository Actions **variable** named `ENABLE_GITHUB_PAGES` with value `true`.

The GitHub connection available for editing files does not have permission to enable the Pages site through GitHub's Pages settings API. That one-time setting must be completed in the repository UI. Check **Settings → General** to confirm the repository's intended visibility; changing visibility requires an explicit owner decision.

## Production checklist

- Replace the provisional logo and verify all colors against Ediova's official brand asset.
- Apply the SQL migration and create the two real Auth accounts.
- Validate RLS and schedule/deadline behavior for both roles in Asia/Karachi time.
- Configure a trusted backup and retention plan, and review monitoring.
- Replace draft privacy and company-policy copy with language matching actual business practices.
- Do not put client secrets or sensitive client data into task descriptions/comments unless the chosen hosting and retention policy explicitly supports it.
