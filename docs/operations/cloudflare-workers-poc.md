# Cloudflare Workers POC

This is a parallel, non-production deployment path for the VELYQ customer app
(`apps/web`). Vercel remains the production hosting path; this document does
not authorize a Cloudflare deployment or a Supabase schema change.

## Commands

Run from `apps/web`:

```text
pnpm run dev:vinext
pnpm run build:vinext
pnpm run start:vinext
pnpm run deploy:vinext
```

The deploy command is intentionally documented only for a future approved POC
deployment. This branch was not deployed to Cloudflare.

For a local Workers preview with the canonical origin explicitly configured:

```text
pnpm exec wrangler dev --config dist/server/wrangler.json --var VELYQ_APPLICATION_ORIGIN:http://127.0.0.1:8787 --var VELYQ_CUSTOMER_INTELLIGENCE_MODE:SYNTHETIC_DEMO
```

The origin is passed explicitly so local preview cannot silently fall back to a
request-controlled origin. Production and preview origins must be configured
per environment in the Cloudflare project.

## Environment names

Public build/runtime variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_VELYQ_ADMIN_URL` (optional)

Server-side variables:

- `VELYQ_APPLICATION_ORIGIN`
- `VELYQ_DATABASE_URL`
- `VELYQ_CUSTOMER_INTELLIGENCE_MODE`
- `VELYQ_SYNTHETIC_PREVIEW` (only where the existing environment contract requires it)

Optional Stripe variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_ID`
- `STRIPE_ELITE_PRICE_ID`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Never place server secrets in `NEXT_PUBLIC_*` variables or commit values.

## Compatibility findings

The vinext compatibility check supports the App Router, route handlers,
`next/server`, `next/headers`, `next/link`, `next/navigation`, and the existing
`proxy.ts`. The existing Next webpack extension-alias configuration is ignored
by vinext; Vite resolves workspace packages natively. The normal Vercel
`next build --webpack` script remains unchanged.

The customer runtime currently uses direct `pg`/`drizzle-orm/node-postgres`
access through `VELYQ_DATABASE_URL`. Cloudflare Workers do not provide direct
Node TCP database sockets. This POC therefore validates the Worker bundle and
public/auth boundary, but a DB-backed Cloudflare deployment needs a compatible
database connection path; Cloudflare Hyperdrive is recommended for a future
production evaluation. No Hyperdrive binding or schema change is introduced
here.

Stripe server routes also require a dedicated Workers runtime compatibility
evaluation before any paid checkout is enabled on Cloudflare. No live billing
or Cloudflare deployment is activated by this POC.
