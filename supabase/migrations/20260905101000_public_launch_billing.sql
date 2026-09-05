CREATE TABLE private.plan_definitions (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  description text NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE private.billing_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE private.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES private.plan_definitions(code) ON DELETE RESTRICT,
  stripe_subscription_id text UNIQUE,
  status text NOT NULL CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX subscriptions_one_live_per_user
  ON private.subscriptions(user_id)
  WHERE status IN ('active', 'trialing', 'past_due', 'incomplete');
CREATE INDEX subscriptions_user_updated_idx ON private.subscriptions(user_id, updated_at DESC);

CREATE TABLE private.billing_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO private.plan_definitions (code, display_name, description, sort_order)
VALUES
  ('FREE', 'Free', 'Core synthetic intelligence preview', 1),
  ('PRO', 'Pro', 'Expanded synthetic intelligence access', 2),
  ('ELITE', 'Elite', 'Full current customer intelligence access', 3)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE private.plan_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.billing_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.plan_definitions, private.billing_customers, private.subscriptions, private.billing_events FROM anon, authenticated;
GRANT SELECT ON TABLE private.plan_definitions, private.billing_customers, private.subscriptions TO service_role;
GRANT INSERT, UPDATE ON TABLE private.billing_customers, private.subscriptions, private.billing_events TO service_role;
