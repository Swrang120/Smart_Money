-- Academy access is tied to the currently authenticated Smart Money user.
-- A member must have an existing, non-deleted, active dashboard profile and package.
create or replace function public.has_active_sm_package()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and coalesce(p.is_active,false) = true
      and coalesce(p.is_deleted,false) = false
      and nullif(trim(coalesce(p.package_name,'')), '') is not null
  );
$$;
revoke all on function public.has_active_sm_package() from public;
revoke all on function public.has_active_sm_package() from anon;
grant execute on function public.has_active_sm_package() to authenticated;

drop policy if exists "sm courses authenticated read published" on public.sm_skill_courses;
drop policy if exists "sm courses active package members read published" on public.sm_skill_courses;
create policy "sm courses active package members read published"
on public.sm_skill_courses for select to authenticated
using ((is_published = true and public.has_active_sm_package()) or (auth.jwt()->>'email')='sboro3235@gmail.com');

drop policy if exists "sm lessons authenticated read published" on public.sm_skill_lessons;
drop policy if exists "sm lessons active package members read published" on public.sm_skill_lessons;
create policy "sm lessons active package members read published"
on public.sm_skill_lessons for select to authenticated
using ((is_published = true and public.has_active_sm_package() and exists (
  select 1 from public.sm_skill_courses c where c.id = course_id and c.is_published = true
)) or (auth.jwt()->>'email')='sboro3235@gmail.com');

drop policy if exists "sm meetings authenticated read published" on public.sm_skill_meetings;
drop policy if exists "sm meetings active package members read published" on public.sm_skill_meetings;
create policy "sm meetings active package members read published"
on public.sm_skill_meetings for select to authenticated
using ((is_published = true and public.has_active_sm_package()) or (auth.jwt()->>'email')='sboro3235@gmail.com');