-- Smart Money Skill Academy: courses, lessons and live sessions
-- Run this migration in Supabase SQL Editor before using the pages.
create extension if not exists pgcrypto;

create table if not exists public.sm_skill_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  description text not null default '',
  cover_url text,
  sort_order int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sm_skill_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.sm_skill_courses(id) on delete cascade,
  title text not null,
  lesson_type text not null default 'video' check (lesson_type in ('video','article','assignment','resource')),
  video_url text,
  content text not null default '',
  duration_minutes int,
  sort_order int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sm_skill_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  meeting_url text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  course_id uuid references public.sm_skill_courses(id) on delete set null,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sm_skill_courses_published_idx on public.sm_skill_courses(is_published, sort_order);
create index if not exists sm_skill_lessons_course_idx on public.sm_skill_lessons(course_id, is_published, sort_order);
create index if not exists sm_skill_meetings_start_idx on public.sm_skill_meetings(starts_at);

alter table public.sm_skill_courses enable row level security;
alter table public.sm_skill_lessons enable row level security;
alter table public.sm_skill_meetings enable row level security;

-- Public learning catalog is readable only when published; writing is restricted to the configured admin.
drop policy if exists "sm courses public read published" on public.sm_skill_courses;
create policy "sm courses public read published" on public.sm_skill_courses
for select to anon, authenticated using (is_published = true or (auth.jwt() ->> 'email') = 'sboro3235@gmail.com');
drop policy if exists "sm courses admin manage" on public.sm_skill_courses;
create policy "sm courses admin manage" on public.sm_skill_courses
for all to authenticated using ((auth.jwt() ->> 'email') = 'sboro3235@gmail.com')
with check ((auth.jwt() ->> 'email') = 'sboro3235@gmail.com');

drop policy if exists "sm lessons public read published" on public.sm_skill_lessons;
create policy "sm lessons public read published" on public.sm_skill_lessons
for select to anon, authenticated using (
  is_published = true and exists (
    select 1 from public.sm_skill_courses c
    where c.id = course_id and c.is_published = true
  )
  or (auth.jwt() ->> 'email') = 'sboro3235@gmail.com'
);
drop policy if exists "sm lessons admin manage" on public.sm_skill_lessons;
create policy "sm lessons admin manage" on public.sm_skill_lessons
for all to authenticated using ((auth.jwt() ->> 'email') = 'sboro3235@gmail.com')
with check ((auth.jwt() ->> 'email') = 'sboro3235@gmail.com');

drop policy if exists "sm meetings read published" on public.sm_skill_meetings;
create policy "sm meetings read published" on public.sm_skill_meetings
for select to anon, authenticated using (is_published = true or (auth.jwt() ->> 'email') = 'sboro3235@gmail.com');
drop policy if exists "sm meetings admin manage" on public.sm_skill_meetings;
create policy "sm meetings admin manage" on public.sm_skill_meetings
for all to authenticated using ((auth.jwt() ->> 'email') = 'sboro3235@gmail.com')
with check ((auth.jwt() ->> 'email') = 'sboro3235@gmail.com');

grant select on public.sm_skill_courses, public.sm_skill_lessons, public.sm_skill_meetings to anon, authenticated;
grant insert, update, delete on public.sm_skill_courses, public.sm_skill_lessons, public.sm_skill_meetings to authenticated;
