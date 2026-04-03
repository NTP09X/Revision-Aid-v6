create table if not exists public.progress (
  user_id uuid not null,
  task_id text not null,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, task_id)
);

alter table public.progress enable row level security;

create policy "users can view own progress"
on public.progress
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can insert own progress"
on public.progress
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can update own progress"
on public.progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own progress"
on public.progress
for delete
to authenticated
using (auth.uid() = user_id);
