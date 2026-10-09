# Ediova Workspace

A separate web workspace for Ediova: a polished public-facing landing page plus a two-role internal task management area.

## Product scope

- Company landing page with animated project elements, Careers and Login entry points.
- Exactly two access roles: **01 Manager** and **02 Managing Director**.
- Manager workspace for assigned tasks, release-date visibility, deadlines, overdue indicators, task links, comments, calendar, completed history and profile.
- Managing Director workspace for creating, scheduling, editing and assigning tasks, setting priorities and deadlines, and reviewing task status and activity.
- Default task time zone: **Asia/Karachi (UTC+05:00)**.
- Responsive layout, accessible keyboard controls and reduced-motion support.

## Important status

This repository is being initialized. The official Ediova logo asset was not provided in the connected context, so any included monogram and palette are provisional until the official asset is added.

The site must not be treated as production-ready until the backend is configured, the database migration is applied, and both roles' access restrictions are tested. Demo/preview mode is local to a browser and does **not** synchronize task data between users.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

## Shared data and authentication (Supabase)

1. Create a Supabase project.
2. Run the SQL migration in `supabase/migrations/` using Supabase SQL Editor.
3. In Supabase Authentication, create/invite the Manager and Managing Director accounts; disable public sign-up.
4. Provision each account's profile row using the authenticated user's actual UUID and the correct role. Do not allow a browser user to assign or change their own role.
5. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository Actions secrets for deployment and as local `.env.local` values for development.
6. Validate RLS and task scheduling using both accounts before putting real company information into the service.

Never expose a Supabase service-role key in browser code, `VITE_*` variables, or committed files. Only a public anon/publishable key belongs in the frontend; database RLS is responsible for authorization.

## Build checks

```bash
npm run typecheck
npm run build
```

## Deployment

The repository includes a GitHub Actions workflow for GitHub Pages. In **Settings → Pages**, select **GitHub Actions** as the build source. Add the two Supabase values under **Settings → Secrets and variables → Actions** after configuring Supabase.

GitHub Pages access for a private repository depends on the GitHub plan and repository settings. If Pages is unavailable for this private repository, keep the repository private and deploy the static frontend through an appropriate connected hosting provider rather than changing repository visibility without approval.

## Security and launch checklist

- Test that Managers cannot read unreleased/future tasks or access Director controls.
- Test that Managers cannot edit task content, deadlines, priority or assignment.
- Test schedule and deadline boundaries in Asia/Karachi time.
- Confirm persistent task updates and comments across devices.
- Review the company policies and privacy notice against actual practices.
- Add backups/retention, monitoring and incident-response procedures.
- Replace the provisional mark and verify brand colors against Ediova's official logo.

## Main areas

- `src/` — frontend
- `public/` — static assets
- `supabase/migrations/` — database schema and authorization policies
- `.github/workflows/` — build/deployment automation
