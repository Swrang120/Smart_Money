revoke all on function public.create_sm_support_ticket(text,text,text,text) from public, anon;
grant execute on function public.create_sm_support_ticket(text,text,text,text) to authenticated;
revoke all on function public.send_sm_support_message(uuid,text,text) from public, anon;
grant execute on function public.send_sm_support_message(uuid,text,text) to authenticated;
revoke all on function public.sm_support_rate_limit_guard() from public, anon, authenticated;
revoke all on function public.sm_support_touch_ticket_updated_at() from public, anon, authenticated;