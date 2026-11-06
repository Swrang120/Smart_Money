-- Smart Gateway identifiers are separate from Razorpay IDs and UPI UTRs.
alter table public.payment_requests
  add column if not exists gateway_order_id text,
  add column if not exists gateway_payment_id text;

create unique index if not exists payment_requests_gateway_payment_id_unique
  on public.payment_requests (gateway_payment_id)
  where gateway_payment_id is not null;

create unique index if not exists payment_requests_gateway_order_id_unique
  on public.payment_requests (gateway_order_id)
  where gateway_order_id is not null;
