-- TNS News community submissions
-- Run this in Supabase Dashboard -> SQL Editor.
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
  created_at timestamptz not null default now()
);

alter table public.stories enable row level security;

-- Visitors can only read stories an editor has published.
drop policy if exists "Anyone can read published stories" on public.stories;
create policy "Anyone can read published stories"
  on public.stories for select
  to anon, authenticated
  using (status = 'published');

-- Intentionally no public insert/update/delete policies.
-- The Edge Function uses the service-role key server-side to insert pending stories.
-- Editors review pending rows in Table Editor and change status to published or rejected.
create index if not exists stories_status_created_at_idx
  on public.stories (status, created_at desc);
