-- Smart Money support live hardening: customer-owned tickets, private messages, spam guard.
alter table public.sm_support_tickets enable row level security;
alter table public.sm_support_messages enable row level security;

-- Customers may create/read their own tickets, but only the Smart Money support team
-- may change status, close, reopen, or block a ticket.
drop policy if exists "Users can update own open Smart Money support tickets" on public.sm_support_tickets;
drop policy if exists "Users can create own Smart Money support tickets" on public.sm_support_tickets;
create policy "Customers create own Smart Money support tickets"
on public.sm_support_tickets for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and length(trim(subject)) between 3 and 120
  and length(trim(description)) between 3 and 4000
);
drop policy if exists "Users can view own Smart Money support tickets" on public.sm_support_tickets;
create policy "Customers view own Smart Money support tickets"
on public.sm_support_tickets for select to authenticated
using (user_id = (select auth.uid()));

-- Enforce valid message shape and add indexes for inbox/history queries.
alter table public.sm_support_messages
  drop constraint if exists sm_support_messages_sender_role_check;
alter table public.sm_support_messages
  add constraint sm_support_messages_sender_role_check
  check (sender_role in ('customer','admin','system'));
alter table public.sm_support_messages
  drop constraint if exists sm_support_messages_message_length_check;
alter table public.sm_support_messages
  add constraint sm_support_messages_message_length_check
  check (length(trim(message)) between 1 and 4000);

create index if not exists sm_support_tickets_status_updated_idx
  on public.sm_support_tickets(status, updated_at desc);
create index if not exists sm_support_messages_ticket_created_idx
  on public.sm_support_messages(ticket_id, created_at asc);
create index if not exists sm_support_messages_user_created_idx
  on public.sm_support_messages(user_id, created_at desc);

-- Database-side rate limits apply even if a browser client is modified.
create or replace function public.sm_support_rate_limit_guard()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  recent_count integer;
begin
  if tg_table_name = 'sm_support_tickets' then
    select count(*) into recent_count
    from public.sm_support_tickets
    where user_id = new.user_id
      and created_at > now() - interval '1 hour';
    if recent_count >= 5 then
      raise exception 'Support ticket limit reached. Please wait before opening another ticket.'
        using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'sm_support_messages' and new.sender_role = 'customer' then
    select count(*) into recent_count
    from public.sm_support_messages
    where user_id = new.user_id
      and sender_role = 'customer'
      and created_at > now() - interval '1 minute';
    if recent_count >= 10 then
      raise exception 'Message rate limit reached. Please wait a moment and try again.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sm_support_ticket_rate_limit on public.sm_support_tickets;
create trigger sm_support_ticket_rate_limit
before insert on public.sm_support_tickets
for each row execute function public.sm_support_rate_limit_guard();

drop trigger if exists sm_support_message_rate_limit on public.sm_support_messages;
create trigger sm_support_message_rate_limit
before insert on public.sm_support_messages
for each row execute function public.sm_support_rate_limit_guard();

create or replace function public.sm_support_touch_ticket_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists sm_support_ticket_updated_at on public.sm_support_tickets;
create trigger sm_support_ticket_updated_at
before update on public.sm_support_tickets
for each row execute function public.sm_support_touch_ticket_updated_at();

-- Only the authenticated customer may send customer messages on their own non-closed,
-- non-timed-out ticket. Admin reply/read policies are maintained separately.
drop policy if exists "Customers send messages on own open tickets" on public.sm_support_messages;
create policy "Customers send messages on own open tickets"
on public.sm_support_messages for insert to authenticated
with check (
  sender_role = 'customer'
  and user_id = (select auth.uid())
  and exists (
    select 1 from public.sm_support_tickets t
    where t.id = sm_support_messages.ticket_id
      and t.user_id = (select auth.uid())
      and t.status <> 'closed'
      and (t.blocked_until is null or t.blocked_until <= now())
  )
);

-- Preserve existing admin SELECT/UPDATE and message-reply policies.
