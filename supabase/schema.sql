-- TNS News database schema and editorial access controls.
-- Run this entire file in Supabase SQL Editor as the project owner.

create extension if not exists pgcrypto;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author text not null check (char_length(author) between 1 and 60),
  category text not null check (category in ('World','Politics','Business','Sports','Technology','Gaming','Local','Opinion')),
  headline text not null check (char_length(headline) between 5 and 120),
  body text not null check (char_length(body) between 40 and 10000),
  image_url text,
  status text not null default 'pending' check (status in ('pending','published','rejected')),
  moderation_flagged boolean not null default false,
  moderation_categories jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

create index if not exists stories_status_created_at_idx
  on public.stories(status, created_at desc);

create table if not exists public.tns_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.stories enable row level security;
alter table public.tns_admins enable row level security;

create or replace function public.is_tns_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tns_admins a where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_tns_admin() from public;
grant execute on function public.is_tns_admin() to authenticated;

drop policy if exists "Anyone can read published stories" on public.stories;
create policy "Anyone can read published stories"
  on public.stories for select to anon, authenticated
  using (status = 'published');

drop policy if exists "Editors can read all stories" on public.stories;
create policy "Editors can read all stories"
  on public.stories for select to authenticated
  using (public.is_tns_admin());

drop policy if exists "Editors can update stories" on public.stories;
create policy "Editors can update stories"
  on public.stories for update to authenticated
  using (public.is_tns_admin())
  with check (public.is_tns_admin());

drop policy if exists "Admins can view their own admin record" on public.tns_admins;
create policy "Admins can view their own admin record"
  on public.tns_admins for select to authenticated
  using (user_id = (select auth.uid()));

grant select on public.stories to anon, authenticated;
grant update (status, reviewed_at, reviewed_by) on public.stories to authenticated;
grant select on public.tns_admins to authenticated;

-- Only the project owner should grant admin access. After creating your account
-- in Supabase Authentication, run the INSERT statement in SETUP.md using your user UUID.
