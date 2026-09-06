# Go-Live Checklist

## DEMO READY (current state — met)
- [x] Cloudflare Worker deployed and healthy
- [x] Hyperdrive database path proven live (query count evidence)
- [x] Supabase Auth working (bad credentials → 401, not 503)
- [x] Synthetic authorization bypass removed
- [x] Security headers present on every live response
- [x] CSRF protection on state-changing routes
- [x] Unauthenticated protected API → 401
- [x] Synthetic data clearly disclosed everywhere it appears
- [x] Rolling "Today" (no longer a fixed 2026-09-04 demo)
- [x] EN/EL parity, mobile/desktop, 60/60 live route×viewport×locale combinations clean
- [x] `pnpm verify` green, 470 tests, both builds pass
- [x] Customer E2E 7/7
- [x] Main branch protected against force-push/deletion
- [x] PR #3 unmerged, `main`/`integration/phase-1` untouched

## PILOT READY (additional, not yet done)
- [ ] Real football/odds data connected for at least one competition
- [ ] Invited-user-only access control (beyond plan tiers)
- [ ] Data-freshness/provider-health monitoring
- [ ] Model backtest baseline (Brier score / log-loss vs. market benchmark)
- [ ] At least one authorized FREE/PRO/ELITE identity for entitlement QA

## COMMERCIAL READY (additional, not yet done)
- [ ] Stripe live mode, full test-mode lifecycle proven first
- [ ] Data commercial rights contracted and cleared
- [ ] Legal review of terms/privacy/subscription-terms/responsible-gambling copy
- [ ] Support process for password reset / account deletion / data export
- [ ] Rate limiting on public auth endpoints
- [ ] Custom domain (optional, not a hard blocker)
- [ ] Owner approval to merge PR #3 / `main`

None of the unchecked items above are solvable by further engineering alone
in this session — they require owner decisions, provider contracts, legal
review, or credentials that don't exist yet.
