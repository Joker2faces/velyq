-- VELYQ provider ingestion scheduler (Supabase Cron / pg_cron + pg_net).
--
-- Deliberately NOT in supabase/migrations. A migration runs in every
-- environment, including the ephemeral Postgres the test suites spin up, and
-- a test database creating a cron job that POSTs to the production admin
-- endpoint would be both wrong and hard to notice. This is an explicit,
-- reproducible operational script instead: idempotent, reviewable in git, and
-- applied deliberately to one project.
--
-- The job carries no provider credential. It holds one capability -- ask the
-- ingestion endpoint to run -- and reads the bearer token from Supabase Vault
-- at call time, so rotating the token never means editing this SQL.
--
-- APPLY
--   Supabase SQL editor (or the Management API) against the velyq project.
--
-- INSPECT
--   select * from cron.job where jobname = 'velyq-provider-ingest';
--   select * from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'velyq-provider-ingest')
--     order by start_time desc limit 20;
--   -- The HTTP response itself (pg_net is asynchronous, so the cron row only
--   -- records that the request was queued):
--   select id, status_code, content_type, timed_out, error_msg, created
--     from net._http_response order by created desc limit 20;
--
-- PAUSE / RESUME
--   select cron.alter_job(
--     (select jobid from cron.job where jobname = 'velyq-provider-ingest'),
--     active := false);   -- resume with active := true
--
-- DELETE SAFELY
--   select cron.unschedule('velyq-provider-ingest');
--   -- Deleting the job stops all ingestion. It changes no data and loses no
--   -- history: fixtures, odds and every run record in
--   -- operations.provider_ingestion_runs survive, so re-scheduling resumes
--   -- exactly where it left off.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: re-applying this file replaces the schedule rather than
-- stacking a second job that would double every provider request.
select cron.unschedule('velyq-provider-ingest')
where exists (
  select 1 from cron.job where jobname = 'velyq-provider-ingest'
);

-- Every 15 minutes.
--
-- The cadence is a *responsiveness* setting, not a spend setting: the
-- orchestrator makes zero provider requests unless database state says work
-- is due, so a wake-up with nothing to do costs nothing but a round trip.
--
-- Fifteen minutes is chosen to match the finest refresh band the odds policy
-- defines (a fixture inside 45 minutes of kickoff may be re-priced every 15
-- minutes). A faster cadence could not produce any additional request -- the
-- policy would refuse it -- and a slower one would blur the final line, which
-- is the observation that matters most.
--
-- Daily arithmetic at this cadence: 96 wake-ups, of which discovery accounts
-- for 8 provider requests (2 dates x a 6-hour freshness window) and odds for
-- at most 60 (the quota allocation), against a ~100-request daily plan with 7
-- held back as recovery reserve.
select cron.schedule(
  'velyq-provider-ingest',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://velyq-admin-staging.vercel.app/api/internal/provider-ingest',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization',
      'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'velyq_scheduler_secret'
      )
    ),
    body := jsonb_build_object('trigger', 'SCHEDULER'),
    timeout_milliseconds := 30000
  );
  $job$
);
