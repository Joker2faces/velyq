ALTER TABLE private.subscriptions
  ADD COLUMN stripe_event_created_at timestamptz;

UPDATE private.subscriptions
SET stripe_event_created_at = updated_at
WHERE stripe_event_created_at IS NULL;

ALTER TABLE private.subscriptions
  ALTER COLUMN stripe_event_created_at SET NOT NULL;

ALTER TABLE private.subscriptions
  DROP CONSTRAINT subscriptions_status_check;

ALTER TABLE private.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN (
    'active', 'trialing', 'past_due', 'canceled', 'unpaid',
    'incomplete', 'incomplete_expired', 'paused'
  ));
