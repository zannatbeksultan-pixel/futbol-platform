create type public.category as enum ('tactics','physical','mental','technique');
create type public.level as enum ('beginner','intermediate','advanced');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  age_group text,
  position text,
  level public.level not null default 'beginner',
  created_at timestamptz not null default now()
);

create table public.exercises (
  id text primary key,
  category public.category not null,
  title text not null,
  summary text not null,
  steps jsonb not null default '[]'::jsonb,
  duration_min int not null default 10,
  levels public.level[] not null default '{beginner,intermediate,advanced}',
  positions text[],
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null references public.exercises(id) on delete cascade,
  day date not null,
  category public.category not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id, day)
);
create index completions_user_day_idx on public.completions(user_id, day);

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.completions enable row level security;

create policy "exercises readable by everyone" on public.exercises for select to anon, authenticated using (true);

create policy "own profile select" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own completions select" on public.completions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own completions insert" on public.completions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own completions delete" on public.completions for delete to authenticated using ((select auth.uid()) = user_id);
