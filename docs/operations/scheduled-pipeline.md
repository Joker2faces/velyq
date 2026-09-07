# The scheduled pipeline

Three internal endpoints on `velyq-admin-staging`, each on its own clock
because each answers to a different one. All three take
`Authorization: Bearer <secret>` and refuse everything else.

| Endpoint                                   | What it does                                                | Natural cadence     |
| ------------------------------------------ | ----------------------------------------------------------- | ------------------- |
| `/api/internal/coverage-sync/scheduled`     | Reads the provider's per-league coverage flags               | Daily               |
| `/api/internal/lineup-cycle/scheduled`      | Polls `/fixtures/lineups` for fixtures near kickoff          | Every 10–15 minutes |
| `/api/internal/prediction-cycle/scheduled`  | Runs the pre-event decision cycle and drains the job queue   | Hourly              |

## Authorization

Two secrets are accepted and either one is sufficient:

- **`CRON_SECRET`** — the name Vercel looks for. When it is set, the platform
  sends it as the bearer token on every scheduled invocation.
- **`VELYQ_TRIGGER_SECRET`** — for an operator running a cycle deliberately.
  Kept separate so rotating the operator's credential cannot silently stop the
  schedule, and so the two can be revoked independently.

Both are provisioned as `sensitive` production environment variables, which
means Vercel will not read them back. That is intentional: an operator who
needs to trigger a run rotates the trigger secret rather than recovering it.

## What the Hobby plan can and cannot schedule

Vercel's Hobby plan allows **daily cron expressions only**. Two are configured
in `apps/admin/vercel.json`:

- coverage sync at 03:10 UTC
- prediction cycle at 03:40 UTC

**The lineup poll is not on a Vercel cron, and cannot be.** A starting eleven
is published roughly an hour before kickoff; a once-a-day poll would miss
essentially every one of them, and configuring it anyway would produce a
schedule that looks like lineup coverage and delivers none.

The endpoint is deployed and works. Driving it needs one of:

1. **A Vercel Pro plan** — restore `{"path": "/api/internal/lineup-cycle/scheduled", "schedule": "*/15 * * * *"}` to the `crons` array.
2. **Any external scheduler** — GitHub Actions on a `schedule:` trigger,
   a cloud scheduler, or a always-on host running `curl` — issuing:

   ```
   GET https://<admin-host>/api/internal/lineup-cycle/scheduled
   Authorization: Bearer $VELYQ_TRIGGER_SECRET
   ```

Until one of those is in place, `LINEUP_AVAILABLE` will be reached only for
fixtures whose lineup happened to be published before a manual poll. The
consequence is visible rather than hidden: the decision lifecycle reports
`WAIT_FOR_LINEUP`, and FORTRESS is refused, which is the correct behaviour for
evidence that genuinely is not there.

## Provider budget

The API-Sports free plan allows **100 requests per day**, shared across
everything. The lineup planner reads the provider's own remaining count and
refuses to spend more than half of what is left in any one invocation, so a
lineup cycle cannot starve the ingestion that follows it. Coverage sync costs
exactly one request per day by using `/leagues?current=true` rather than one
call per league.
