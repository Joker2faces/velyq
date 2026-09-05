# VELYQ Public Launch Readiness

This addendum extends the approved Phase 1 architecture with the minimum
public and commercial surface. The Phase 1 design remains authoritative for
intelligence, provider replay, quality, prediction, and administration.

## Public entry and identity

The customer app has a public landing page with honest Phase 1 language:
synthetic data, experimental predictions, and development-heuristic EDGE and
RADAR. Visitors may create an account or sign in. Supabase Auth owns password
storage, confirmation, recovery, and token validation. New accounts receive a
server-provisioned CUSTOMER profile only; request metadata never selects roles.

## Plans and entitlements

FREE, PRO, and ELITE are customer subscription tiers, independent from the
ADMIN authorization role. A centralized server entitlement resolver returns the
effective plan, subscription status, and feature decisions. The initial matrix
is conservative and only gates capabilities that already exist in the customer
application. ADMIN permissions never come from a plan.

## Billing

Stripe is the billing source of truth. VELYQ stores a projection containing the
Stripe customer/subscription identifiers, status, billing period, and
cancel-at-period-end flag. Checkout and Billing Portal sessions are created
server-side for the authenticated VELYQ user. Approved Price IDs are selected
from server configuration; clients cannot submit arbitrary prices or customer
IDs. Webhooks require signature verification and event-ID idempotency.

## Account and public information

The account surface shows email, effective plan, subscription state, billing
actions, and sign-out. Pricing describes only implemented entitlements and is
configuration-driven until EUR prices are approved. Terms, Privacy,
Responsible Use, and Subscription/Cancellation information are public draft
pages and require legal review before commercial scale.

## Security and deployment

Billing secrets remain server-only and are never committed or exposed through
`NEXT_PUBLIC_*`. Customer billing rows are owner-readable under RLS and only
trusted webhook/server workflows may mutate authoritative state. Customer and
Admin remain separate Vercel applications; ordinary customer traffic does not
require Vercel team SSO. Test-mode Stripe verification precedes any live-mode
activation.
