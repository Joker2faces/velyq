# Entitlement QA Checklist (run once QA identities exist)

For each of `qa-free`, `qa-pro`, `qa-elite`, sign in at
https://velyq-poc.joker2face1990.workers.dev/sign-in and check:

| Route | FREE | PRO | ELITE |
|---|---|---|---|
| Today | allowed | allowed | allowed |
| EDGE | preview only | full | full |
| RADAR | preview only | full | full |
| Match Intelligence | locked | locked | allowed |
| Account | allowed | allowed | allowed |
| Admin | denied | denied | denied (independent of plan) |

Also, for each identity, hit the underlying APIs directly (not just the UI)
to confirm the server enforces the same thing the UI shows:
```
GET /api/v1/today
GET /api/v1/events/<eventId>/intelligence   (with a real event id from Today)
```

Session flows to exercise per identity: login → logout → login again →
refresh the page (session persists) → sign out → confirm protected page
redirects to `/sign-in` → confirm the protected API returns 401.

Record PASS/FAIL per cell above in this file once run; do not mark PASS
without having actually executed it.
