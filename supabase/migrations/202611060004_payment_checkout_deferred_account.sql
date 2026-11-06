-- Payment checkout hardening: defer Auth/profile creation until admin approval.
-- Razorpay identifiers are separate from UPI's 12-digit transaction_id.
alter table public.payment_requests
  add column if not exists razorpay_order_id text,
  add column if not exists razorpay_payment_id text;

create unique index if not exists payment_requests_razorpay_payment_id_unique
  on public.payment_requests (razorpay_payment_id)
  where razorpay_payment_id is not null;

create unique index if not exists payment_requests_razorpay_order_id_unique
  on public.payment_requests (razorpay_order_id)
  where razorpay_order_id is not null;
