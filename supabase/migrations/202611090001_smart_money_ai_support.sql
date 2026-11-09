create table if not exists public.sm_support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'general' check (category in ('payment','login','package','commission','course','withdrawal','general')),
  subject text not null,
  description text not null,
  status text not null default 'pending' check (status in ('pending','under_review','replied','closed')),
  ai_summary text,
  ai_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sm_support_tickets_user_created_idx on public.sm_support_tickets(user_id, created_at desc);
alter table public.sm_support_tickets enable row level security;
drop policy if exists "Users can create own Smart Money support tickets" on public.sm_support_tickets;
create policy "Users can create own Smart Money support tickets"
on public.sm_support_tickets for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists "Users can view own Smart Money support tickets" on public.sm_support_tickets;
create policy "Users can view own Smart Money support tickets"
on public.sm_support_tickets for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists "Users can update own open Smart Money support tickets" on public.sm_support_tickets;
create policy "Users can update own open Smart Money support tickets"
on public.sm_support_tickets for update to authenticated
using ((select auth.uid()) = user_id and status in ('pending','under_review'))
with check ((select auth.uid()) = user_id and status in ('pending','under_review'));
