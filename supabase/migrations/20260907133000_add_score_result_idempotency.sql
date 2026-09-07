alter table intelligence.score_results
  add column if not exists idempotency_key text;

update intelligence.score_results
set idempotency_key = 'legacy:' || id::text
where idempotency_key is null;

alter table intelligence.score_results
  alter column idempotency_key set not null;

create unique index if not exists score_results_idempotency_key_unique
  on intelligence.score_results (idempotency_key);
