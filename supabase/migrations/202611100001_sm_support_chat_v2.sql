-- Smart Money private support chat v2 (additive migration)
alter table public.sm_support_tickets
  add column if not exists attachment_path text,
  add column if not exists blocked_until timestamptz,
  add column if not exists closed_at timestamptz;

drop policy if exists "Users can update own open Smart Money support tickets" on public.sm_support_tickets;
drop policy if exists "Smart Money support admins can view all tickets" on public.sm_support_tickets;
create policy "Smart Money support admins can view all tickets"
on public.sm_support_tickets for select to authenticated
using (lower(coalesce((auth.jwt()->>'email'),'')) in ('sboro3235@gmail.com','phwilawswargiary6900@gmail.com'));
drop policy if exists "Smart Money support admins can update tickets" on public.sm_support_tickets;
create policy "Smart Money support admins can update tickets"
on public.sm_support_tickets for update to authenticated
using (lower(coalesce((auth.jwt()->>'email'),'')) in ('sboro3235@gmail.com','phwilawswargiary6900@gmail.com'))
with check (lower(coalesce((auth.jwt()->>'email'),'')) in ('sboro3235@gmail.com','phwilawswargiary6900@gmail.com'));
drop policy if exists "Users can create own Smart Money support tickets" on public.sm_support_tickets;
create policy "Users can create own Smart Money support tickets"
on public.sm_support_tickets for insert to authenticated
with check ((select auth.uid()) = user_id and status = 'pending' and ai_summary is null and ai_reply is null);

create table if not exists public.sm_support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.sm_support_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','admin','assistant')),
  message text not null check (char_length(message) between 1 and 4000),
  attachment_path text,
  created_at timestamptz not null default now()
);
create index if not exists sm_support_messages_ticket_created_idx on public.sm_support_messages(ticket_id, created_at asc);
alter table public.sm_support_messages enable row level security;

drop policy if exists "Customers view messages on own tickets" on public.sm_support_messages;
create policy "Customers view messages on own tickets"
on public.sm_support_messages for select to authenticated
using (exists (select 1 from public.sm_support_tickets t where t.id=ticket_id and t.user_id=(select auth.uid())));
drop policy if exists "Customers send messages on own open tickets" on public.sm_support_messages;
create policy "Customers send messages on own open tickets"
on public.sm_support_messages for insert to authenticated
with check (sender_role='customer' and user_id=(select auth.uid()) and exists (
  select 1 from public.sm_support_tickets t where t.id=ticket_id and t.user_id=(select auth.uid())
  and t.status <> 'closed' and (t.blocked_until is null or t.blocked_until <= now())
));
drop policy if exists "Smart Money support admins view messages" on public.sm_support_messages;
create policy "Smart Money support admins view messages"
on public.sm_support_messages for select to authenticated
using (lower(coalesce((auth.jwt()->>'email'),'')) in ('sboro3235@gmail.com','phwilawswargiary6900@gmail.com'));
drop policy if exists "Smart Money support admins send replies" on public.sm_support_messages;
create policy "Smart Money support admins send replies"
on public.sm_support_messages for insert to authenticated
with check (sender_role='admin' and user_id=(select auth.uid()) and lower(coalesce((auth.jwt()->>'email'),'')) in ('sboro3235@gmail.com','phwilawswargiary6900@gmail.com'));

create or replace function public.create_sm_support_ticket(p_category text,p_subject text,p_message text,p_attachment_path text default null)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_ticket_id uuid; v_category text := lower(coalesce(p_category,'general'));
begin
 if v_uid is null then raise exception 'Please sign in to create a support ticket.'; end if;
 if v_category not in ('payment','login','package','commission','course','withdrawal','general') then raise exception 'Invalid support category.'; end if;
 if char_length(trim(coalesce(p_subject,''))) < 3 or char_length(p_subject)>120 then raise exception 'Subject must be between 3 and 120 characters.'; end if;
 if char_length(trim(coalesce(p_message,''))) < 3 or char_length(p_message)>4000 then raise exception 'Message must be between 3 and 4000 characters.'; end if;
 if p_attachment_path is not null and split_part(p_attachment_path,'/',1) <> v_uid::text then raise exception 'Invalid attachment ownership.'; end if;
 insert into public.sm_support_tickets(user_id,category,subject,description,status,attachment_path)
 values(v_uid,v_category,trim(p_subject),trim(p_message),'pending',p_attachment_path) returning id into v_ticket_id;
 insert into public.sm_support_messages(ticket_id,user_id,sender_role,message,attachment_path)
 values(v_ticket_id,v_uid,'customer',trim(p_message),p_attachment_path);
 return v_ticket_id;
end; $$;

create or replace function public.send_sm_support_message(p_ticket_id uuid,p_message text,p_attachment_path text default null)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_message_id uuid;
begin
 if v_uid is null then raise exception 'Please sign in.'; end if;
 if char_length(trim(coalesce(p_message,''))) < 1 or char_length(p_message)>4000 then raise exception 'Message must be between 1 and 4000 characters.'; end if;
 if p_attachment_path is not null and split_part(p_attachment_path,'/',1) <> v_uid::text then raise exception 'Invalid attachment ownership.'; end if;
 insert into public.sm_support_messages(ticket_id,user_id,sender_role,message,attachment_path)
 select t.id,v_uid,'customer',trim(p_message),p_attachment_path from public.sm_support_tickets t
 where t.id=p_ticket_id and t.user_id=v_uid and t.status<>'closed' and (t.blocked_until is null or t.blocked_until<=now());
 if not found then raise exception 'This ticket is closed, unavailable, or temporarily restricted.'; end if;
 update public.sm_support_tickets set status='pending',updated_at=now() where id=p_ticket_id and user_id=v_uid and status<>'closed';
 select id into v_message_id from public.sm_support_messages where ticket_id=p_ticket_id and user_id=v_uid and sender_role='customer' order by created_at desc limit 1;
 return v_message_id;
end; $$;

revoke all on function public.create_sm_support_ticket(text,text,text,text) from public;
grant execute on function public.create_sm_support_ticket(text,text,text,text) to authenticated;
revoke all on function public.send_sm_support_message(uuid,text,text) from public;
grant execute on function public.send_sm_support_message(uuid,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('support-attachments','support-attachments',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "Customers upload own support attachments" on storage.objects;
create policy "Customers upload own support attachments" on storage.objects for insert to authenticated
with check(bucket_id='support-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Customers view own support attachments" on storage.objects;
create policy "Customers view own support attachments" on storage.objects for select to authenticated
using(bucket_id='support-attachments' and ((storage.foldername(name))[1]=(select auth.uid())::text or lower(coalesce((auth.jwt()->>'email'),'')) in ('sboro3235@gmail.com','phwilawswargiary6900@gmail.com')));
drop policy if exists "Customers delete own support attachments" on storage.objects;
create policy "Customers delete own support attachments" on storage.objects for delete to authenticated
using(bucket_id='support-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Smart Money admins delete support attachments" on storage.objects;
create policy "Smart Money admins delete support attachments" on storage.objects for delete to authenticated
using(bucket_id='support-attachments' and lower(coalesce((auth.jwt()->>'email'),'')) in ('sboro3235@gmail.com','phwilawswargiary6900@gmail.com'));
