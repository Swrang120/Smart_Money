# Smart Gateway integration setup

This branch adds a gated Smart Gateway checkout option. The existing Razorpay/manual payment paths remain available until the Gateway merchant configuration, database migration, webhook delivery, and a real low-value reconciliation test are complete.

## Vercel environment variables (Smart Money project)

Set these as encrypted Production variables:

- `SMART_GATEWAY_API_URL`: public payment API origin for the deployed SMART_GATEWAY_ project (not the checkout portal URL).
- `SMART_GATEWAY_API_KEY`: server-side merchant API key.
- `SMART_GATEWAY_WEBHOOK_SECRET`: matching merchant webhook signing secret.
- `SUPABASE_URL`: existing Smart Money Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: existing server-only Supabase service-role key.

Never put merchant keys or the service-role key in browser JavaScript, GitHub source, or chat messages.

## Gateway webhook destination

Configure the Smart Money merchant webhook URL as:

`https://smart-money-navy.vercel.app/api/gateway/webhook`

Subscribe to payment events. The handler only creates a pending Smart Money payment request for a signed `RECONCILED` UPI event with `settlementState=RECONCILED`. `OBSERVED_SUCCESS`, `SUCCESS`, and other statuses are not treated as settled UPI payments.

## Database migration

Apply `supabase/migrations/202611060005_smart_gateway_payment_ids.sql` to the Smart Money Supabase project before enabling live traffic.

## Final activation checklist

1. Configure the Gateway project variables `SMART_MONEY_GATEWAY_API_KEY`, `SMART_MONEY_GATEWAY_WEBHOOK_SECRET`, and `SMART_MONEY_GATEWAY_WEBHOOK_URL`; the first-party merchant UUID is provisioned by the Gateway code. Configure a persistent database and an active UPI receiving account for that merchant.
2. Configure the five server-side environment variables above. The merchant UUID is already fixed in the integration to the Smart Money first-party merchant provisioned by the Gateway repository.
3. Apply the SQL migration.
4. Send a test webhook and verify invalid signatures are rejected.
5. Run one low-value end-to-end UPI payment and reconcile it against a bank statement.
6. Verify one pending payment request appears in Smart Money admin and account creation still waits for admin approval.
7. Only after all checks pass, hide the legacy payment methods from customers.

The current Smart Money QR image is not automatically proof of a Gateway receiving account. The same bank/UPI receiving account must be configured in the Gateway merchant admin; do not assume a static QR upload configures settlement observation.
