-- Require a real authenticated Supabase session before reading Academy courses, lessons, or meetings.
-- Main Smart Money authentication is not changed.

drop policy if exists "sm courses public read published" on public.sm_skill_courses;
create policy "sm courses authenticated read published" on public.sm_skill_courses
for select to authenticated
using (
  (
    is_published = true
    and (select auth.uid()) is not null
    and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  or (select auth.jwt() ->> 'email') = 'sboro3235@gmail.com'
);

drop policy if exists "sm lessons public read published" on public.sm_skill_lessons;
create policy "sm lessons authenticated read published" on public.sm_skill_lessons
for select to authenticated
using (
  (
    is_published = true
    and (select auth.uid()) is not null
    and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.sm_skill_courses c
      where c.id = course_id and c.is_published = true
    )
  )
  or (select auth.jwt() ->> 'email') = 'sboro3235@gmail.com'
);

drop policy if exists "sm meetings read published" on public.sm_skill_meetings;
create policy "sm meetings authenticated read published" on public.sm_skill_meetings
for select to authenticated
using (
  (
    is_published = true
    and (select auth.uid()) is not null
    and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  )
  or (select auth.jwt() ->> 'email') = 'sboro3235@gmail.com'
);

revoke all privileges on public.sm_skill_courses, public.sm_skill_lessons, public.sm_skill_meetings from anon;
grant select on public.sm_skill_courses, public.sm_skill_lessons, public.sm_skill_meetings to authenticated;
