# Phase 1 known limitations

These limitations are release constraints, not a backlog hidden behind
successful builds.

- The product is synthetic-only. It has no real sports, odds, bookmaker,
  lineup, injury, or streaming integration and makes no production model,
  performance, legal, or compliance claim.
- Only the Phase 1 market examples and fictional catalog are supported. There
  is no full settlement engine, player-prop implementation, multi-sport UI,
  public API commitment, paid-plan flow, notification system, or broad admin
  CRUD.
- Vercel hosts only request-oriented customer/admin applications. Ingestion and
  prediction workers require separately operated persistent compute.
- The operational query freshness threshold is an operator default, not a
  measured service-level objective. Fixed-clock synthetic data naturally looks
  stale against wall-clock time.
- The remote staging seed is one-time and empty-database-only. It does not
  create Auth users, reseed production, merge fixture changes, or undo itself.
- Database rollback is forward-fix or restore-to-new-instance. There is no
  automated down-migration path.
- Staging smoke tests skip when credentials are absent unless the documented
  variable preflight is run. A skipped smoke test is not acceptance evidence.
- End-to-end telemetry delivery through `VELYQ_OTEL_ENDPOINT` is not currently
  recorded as accepted evidence.
- On 2026-09-05 this source machine has no Docker CLI, so current local
  migration reset, pgTAP/RLS, database lint, and advisor execution cannot be
  recorded here.
- GitHub Actions at `fba8748` is blocked by an account billing lock, and Vercel
  deployment is blocked by a platform rate limit. See the
  [acceptance ledger](../execution/acceptance-evidence.md); neither condition is
  an application test failure or a release pass.
