# Read-only operational queries

These PostgreSQL queries support the Phase 1 synthetic environment. Run them
through a read-only database role or a transaction declared read-only. They do
not remediate data and contain no mutation statements.

| Query | Use when | Important interpretation |
| --- | --- | --- |
| [failed-provider-runs.sql](./failed-provider-runs.sql) | Provider ingestion reports failures/rejections | Rejections can be expected quarantines; inspect `error_summary` and counts before escalation |
| [stale-observations.sql](./stale-observations.sql) | UI/provider freshness is suspect | Default threshold is 15 minutes; synthetic fixed-clock datasets will naturally appear stale |
| [job-backlog.sql](./job-backlog.sql) | Workers lag, stop, or repeatedly retry | Includes overdue pending, expired running leases, and failed jobs |
| [prediction-failures.sql](./prediction-failures.sql) | Prediction output is absent/incomplete | Correlates failed/incomplete prediction runs with trigger-job error state |

Example with `psql`:

```powershell
psql '<read-only-connection-url>' -v ON_ERROR_STOP=1 -f docs/operations/queries/job-backlog.sql
```

Expected output: a tabular result (possibly zero rows) and exit code `0`. Keep
the query timestamp, target, row count, relevant IDs, and correlation IDs in the
incident record. Do not paste connection URLs or unredacted payload/error JSON
into tickets.
