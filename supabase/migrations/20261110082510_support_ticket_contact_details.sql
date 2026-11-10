-- Persist the member contact context with each support ticket so staff can
-- identify the requester even if profile details are edited later.
alter table public.sm_support_tickets
  add column if not exists contact_email text,
  add column if not exists contact_mobile text,
  add column if not exists referral_id text;

create or replace function public.create_sm_support_ticket(
  p_category text,
  p_subject text,
  p_message text,
  p_attachment_path text default null
) returns uuid
language plpgsql
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_ticket_id uuid;
  v_category text := lower(coalesce(p_category,'general'));
  v_email text := nullif(auth.jwt() ->> 'email','');
  v_mobile text;
  v_referral text;
begin
  if v_uid is null then raise exception 'Please sign in to create a support ticket.'; end if;
  if v_category not in ('payment','login','package','commission','course','withdrawal','general') then
    raise exception 'Invalid support category.';
  end if;
  if char_length(trim(coalesce(p_subject,''))) < 3 or char_length(p_subject) > 120 then
    raise exception 'Subject must be between 3 and 120 characters.';
  end if;
  if char_length(trim(coalesce(p_message,''))) < 3 or char_length(p_message) > 4000 then
    raise exception 'Message must be between 3 and 4000 characters.';
  end if;
  if p_attachment_path is not null and split_part(p_attachment_path,'/',1) <> v_uid::text then
    raise exception 'Invalid attachment ownership.';
  end if;

  select p.mobile, coalesce(nullif(p.referral_id,''),nullif(p.referral_code,''))
    into v_mobile,v_referral
    from public.profiles p
   where p.user_id=v_uid
   limit 1;
  v_email := coalesce(
    (select nullif(p.email,'') from public.profiles p where p.user_id=v_uid limit 1),
    v_email
  );

  insert into public.sm_support_tickets(
    user_id,category,subject,description,status,attachment_path,
    contact_email,contact_mobile,referral_id
  )
  values(
    v_uid,v_category,trim(p_subject),trim(p_message),'pending',p_attachment_path,
    v_email,nullif(v_mobile,''),nullif(v_referral,'')
  )
  returning id into v_ticket_id;

  insert into public.sm_support_messages(ticket_id,user_id,sender_role,message,attachment_path)
  values(v_ticket_id,v_uid,'customer',trim(p_message),p_attachment_path);
  return v_ticket_id;
end;
$function$;

grant execute on function public.create_sm_support_ticket(text,text,text,text) to authenticated;
