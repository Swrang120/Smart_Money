# Smart Money Private Support Lab — Preview Only

This directory is an isolated UI prototype on branch `support-ai-private-preview`.

## Safety boundary
- No Smart Money Supabase URL/key, auth session, live customer data, Gmail connection, Gemini/OpenAI API, or external model endpoint is used.
- All names, emails, IDs, packages, statuses, and conversations in the preview are fabricated demo values.
- Chat state exists only in this browser tab/session. Do not enter real customer data.
- The in-page answer logic is a deterministic rules-based simulation, not a trained or hosted AI model.
- This branch must not be merged into production until the owner explicitly approves the completed test.

## Intended final architecture (not yet deployed)
1. Customer portal creates a support case and uploads screenshots to private object storage using short-lived, scoped upload authorization.
2. A private support service authenticates staff and customers, enforces ownership, rate limits messages, and records immutable audit events.
3. A read-only data gateway retrieves only the signed-in customer's approved profile, orders/payment requests, package state, referral ID, commissions and withdrawals. The language model never receives service-role credentials and cannot execute mutations.
4. A self-hosted open-weight language model runs on infrastructure controlled by Smart Money. Customer records are sent only to this private inference service over a private network; no OpenAI/Gemini/third-party AI API.
5. The model produces an answer grounded in the read-only records. Low-confidence, missing, or sensitive cases are escalated to the human support inbox.
6. Admin inbox supports reply, ticket close/reopen, timeout, and block/unblock. Payment approval, activation, wallet and withdrawal actions remain outside the assistant.
7. Gmail is optional for staff notifications only; customer-facing replies stay inside the support conversation. Any email delivery must be clearly branded as Smart Money Support.

## Before production
- Select and benchmark a self-hosted model on the target hardware; estimate GPU/RAM and monthly cost.
- Add staff MFA/role checks, customer ownership checks, rate limits, file scanning/type/size limits, signed private screenshot URLs, retention controls and audit logs.
- Test prompt-injection resistance, cross-customer isolation, timeout/block enforcement and model failure fallback.
- Run security review and end-to-end tests with synthetic accounts before connecting any live data.
