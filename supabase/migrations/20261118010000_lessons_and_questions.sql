create table public.lesson_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  score int not null check (score >= 0),
  total int not null check (total > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (char_length(text) between 8 and 600),
  category text not null default 'other' check (category in ('tactics','physical','mental','technique','other')),
  is_public boolean not null default false,
  answer text,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index questions_user_idx on public.questions(user_id, created_at desc);
create index questions_public_idx on public.questions(created_at desc) where is_public and answer is not null;

alter table public.lesson_results enable row level security;
alter table public.questions enable row level security;

create policy "own lesson results select" on public.lesson_results for select to authenticated using ((select auth.uid()) = user_id);
create policy "own lesson results insert" on public.lesson_results for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own lesson results update" on public.lesson_results for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Ойыншы өз сұрақтарын және бапкер жариялаған жауапты сұрақтарды көреді
create policy "questions select own or public" on public.questions for select to authenticated
  using ((select auth.uid()) = user_id or (is_public and answer is not null));
-- Ойыншы тек сұрақ жаза алады; жауапты бапкер Supabase панелінен (service role) жазады
create policy "questions insert own" on public.questions for insert to authenticated
  with check ((select auth.uid()) = user_id and answer is null and answered_at is null and is_public = false);
