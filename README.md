# Ediova Inc. — Workspace

A React, TypeScript and Vite website for Ediova Inc., with an authenticated task workspace powered by Supabase.

## What's included

- Green-gradient Ediova logo and blended green/lime palette with a small orange accent.
- Animated landing page and a 2-second logo transition when entering login.
- No role picker on login. Supabase assigns role access from the signed-in profile.
- Login inputs are not saved by the app; browser autofill is discouraged.
- Manager and Managing Director task views, a clean deadline-first dashboard, task-detail popup, comments, resources and calendar.
- Recurring tasks: daily, weekly, and monthly on selected calendar dates, with one or two dates each month.
- Completed work is moved out of active tasks. The Director can reopen completed tasks.
- A seven-person team directory popup.
- A company-notice tool for the Managing Director; the latest active notice appears at the top of dashboards.
- Manager performance scoring: every full 24 hours a task is late deducts 10 points from the score (minimum 0). Scores are recalculated from live task data.
- Asia/Karachi (UTC+05:00) display and scheduling.
- Supabase row-level security, a recurring-task generator scheduled hourly, security headers, organization metadata, robots.txt and sitemap.xml.

## Team directory

1. Hamza Mubarak — Managing Director — Yogyakarta, Indonesia
2. Humna Haroon — Manager — Islamabad, Pakistan
3. Syed Shaheer — Senior Video Editor — Faisalabad, Pakistan
4. Muhammad Hammad — Anime Expert — Aceh, Indonesia
5. Ahmer Munir — Truvision Studio — Hafizabad, Pakistan
6. Ahmer Khan — Junior Video Editor — Karachi, Pakistan
7. Salman Asghar — Journal Writing — Sialkot, Pakistan

The first two people are linked to the existing Supabase Auth profiles. The other five are directory entries only; create Auth accounts and provision roles separately before allowing them to sign in.

## Run locally

Requires Node.js 22 or newer.

~~~bash
npm install
cp .env.example .env.local
npm run dev
~~~

The site has a public Supabase project URL and publishable key configured as defaults in src/lib/supabase.ts; local environment variables can override them. Preview/demo fallback is intended only for reviewing the UI and is not shared between users.

## CAPTCHA / bot protection

The login supports Cloudflare Turnstile, a low-friction CAPTCHA option supported by Supabase Auth. Supabase Auth does not natively configure Google reCAPTCHA in the same way; do not substitute a decorative checkbox for real server-verified CAPTCHA.

To activate it:
1. Create a Turnstile widget in Cloudflare for the published site hostname.
2. In Supabase Dashboard → Authentication → Protection / Bot and Abuse Protection, enable CAPTCHA, choose Cloudflare Turnstile, and enter the widget's secret key.
3. In GitHub repository Settings → Secrets and variables → Actions → Variables, add VITE_TURNSTILE_SITE_KEY with the widget's public site key. The deployment workflow passes that public key to Vite.
4. For local testing, add VITE_TURNSTILE_SITE_KEY to .env.local. The secret key belongs only in Supabase's dashboard—not in this repository or any VITE_* variable.

Until both the provider secret in Supabase and the public site key for the frontend are configured, the CAPTCHA is not active. Sign-in remains protected by Supabase authentication and row-level permissions, but bot protection is not complete.

## Existing Supabase project

The app connects to the existing Supabase project used for Ediova. The database migrations already applied to that project include:
- Row-level task access, including manager release-time restrictions.
- The recurrence fields and hourly generator.
- Team directory and notices tables.
- Manager performance view.
- Tightened task-level comment/history policies.

Do not apply the older starter migration in supabase/migrations/202610090001_initial_schema.sql to the current database as a new schema; it predates the live schema. Use Supabase's recorded migrations and the live schema as the source of truth.

## Production verification

The current database contains the two authenticated profiles. Before relying on the workspace for operations, sign in separately with each real account in the browser and verify:
- The manager can see assigned released work only, complete tasks, add comments and open completed work.
- The director can create, edit, schedule, repeat, reopen and assign tasks, view performance, send a notice and archive it.
- A monthly task configured for two dates generates two future occurrences per month at the configured release time.
- The Manager's performance score drops by 10 points for every full day late per task and never falls below 0.

Never publish a Supabase service-role key. Frontend Supabase keys are public; the database's RLS rules are the authorization boundary.

## Deployment

The default public site is GitHub Pages:
https://dummyhamza4200.github.io/ediova-workspace/

GitHub Actions runs npm run build (type-check + Vite build) and deploys the dist output. The Vercel Git connection is not configured by this repository; it must be linked from a correctly authorized Vercel account if Vercel is preferred.

Ediova Inc.
Jl. Kaluirang 14,5
Yogyakarta, Indonesia 55584
Tel: +62 (813) 77012611
