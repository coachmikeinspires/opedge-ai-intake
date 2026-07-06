# Opendge Intake App

This is a Next.js TypeScript intake form for Opendge client onboarding.

## Setup

1. Copy environment variables into Railway:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `DAKOTA_NOTIFY_WEBHOOK` (optional)
   - `SENTRY_DSN` (optional)

2. Deploy to Railway with the verified custom domain `intake.opedge.ai`.

3. Ensure the Supabase tables exist with the schemas below.

## Supabase schemas

```sql
create table if not exists intake_links (
  client_id uuid not null primary key,
  is_active boolean not null default true,
  created_at timestamp with time zone default now(),
  expires_at timestamp with time zone
);

create table if not exists intake_submissions (
  id bigint generated always as identity primary key,
  client_id uuid not null unique,
  company_name text,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  team_contacts jsonb,
  email_accounts jsonb,
  products_subscribed text[],
  autoleads_verticals text[],
  autoleads_campaign_goals text,
  frank_workflows jsonb,
  dakota_preferences jsonb,
  google_workspace_verified boolean default false,
  google_workspace_email text,
  google_workspace_domain text,
  social_links jsonb,
  landing_page_urls text[],
  launch_date date,
  kickoff_date date,
  notes text,
  form_data_hash text,
  submitted_at timestamp with time zone,
  ip_address inet,
  user_agent text,
  is_verified boolean default false,
  mike_notified boolean default false,
  dennis_notified boolean default false
);

create table if not exists intake_submission_attempts (
  id bigint generated always as identity primary key,
  client_id uuid,
  ip_address inet,
  user_agent text,
  attempted_at timestamp with time zone default now(),
  status text,
  error_message text
);
```
