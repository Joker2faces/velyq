BEGIN;
SELECT plan(20);

INSERT INTO auth.users (
  id,
  email,
  raw_user_meta_data,
  raw_app_meta_data,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-4000-8000-000000000010',
  'server-profile@velyq.local',
  '{}'::jsonb,
  '{}'::jsonb,
  '2026-09-03T12:00:00Z',
  '2026-09-03T12:00:00Z'
);

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.profiles$$,
  '42501',
  NULL,
  'anonymous clients cannot read profiles'
);
RESET ROLE;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.profiles),
  1::bigint,
  'an authenticated owner sees exactly their profile'
);
SELECT is(
  (SELECT display_name FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000001'),
  'Synthetic Owner'::text,
  'the owner sees their own profile contents'
);
SELECT is(
  (SELECT count(*) FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000002'),
  0::bigint,
  'the owner cannot see another user profile'
);
SELECT lives_ok(
  $$UPDATE public.profiles SET display_name = 'Owner Updated' WHERE user_id = '00000000-0000-4000-8000-000000000001'$$,
  'the owner can update allowed fields on their profile'
);
SELECT is(
  (SELECT display_name FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000001'),
  'Owner Updated'::text,
  'the owner update is visible inside the transaction'
);
SELECT is(
  (
    WITH changed AS (
      UPDATE public.profiles
      SET display_name = 'Blocked Cross-Profile Update'
      WHERE user_id = '00000000-0000-4000-8000-000000000002'
      RETURNING 1
    )
    SELECT count(*) FROM changed
  ),
  0::bigint,
  'an owner cannot update another user profile'
);
SELECT throws_ok(
  $$INSERT INTO public.profiles (user_id, display_name) VALUES ('00000000-0000-4000-8000-000000000010', 'Browser Insert')$$,
  '42501',
  NULL,
  'authenticated owners cannot directly insert profiles'
);
SELECT throws_ok(
  $$DELETE FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000001'$$,
  '42501',
  NULL,
  'authenticated browser clients cannot delete profiles'
);
RESET ROLE;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.profiles),
  1::bigint,
  'the other authenticated user sees exactly their own profile'
);
SELECT is(
  (SELECT display_name FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000002'),
  'Synthetic Other User'::text,
  'the other authenticated user sees their own profile'
);
SELECT is(
  (SELECT count(*) FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000001'),
  0::bigint,
  'the other authenticated user cannot read the owner profile'
);
SELECT lives_ok(
  $$UPDATE public.profiles SET display_name = 'Other Updated' WHERE user_id = '00000000-0000-4000-8000-000000000002'$$,
  'the other authenticated user can update their own profile'
);
SELECT is(
  (SELECT display_name FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000002'),
  'Other Updated'::text,
  'the other authenticated user sees their own update'
);
SELECT is(
  (
    WITH changed AS (
      UPDATE public.profiles
      SET display_name = 'Blocked Other-User Update'
      WHERE user_id = '00000000-0000-4000-8000-000000000001'
      RETURNING 1
    )
    SELECT count(*) FROM changed
  ),
  0::bigint,
  'the other authenticated user cannot update the owner profile'
);
RESET ROLE;

SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM private.roles$$,
  '42501',
  NULL,
  'an admin identity using the browser role cannot bypass internal-schema boundaries'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is(
  (SELECT count(*) FROM public.profiles),
  3::bigint,
  'the privileged server role can read all seeded profiles'
);
SELECT is(
  (SELECT count(*) FROM private.roles),
  2::bigint,
  'the privileged server role can read internal authorization data'
);
SELECT lives_ok(
  $$
    INSERT INTO public.profiles (
      user_id,
      display_name,
      locale,
      timezone,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-4000-8000-000000000010',
      'Server-created profile',
      'en',
      'UTC',
      '2026-09-03T12:00:00Z',
      '2026-09-03T12:00:00Z'
    )
  $$,
  'the privileged server role can create a profile without a public insert policy'
);
SELECT is(
  (SELECT display_name FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000010'),
  'Server-created profile'::text,
  'the privileged server profile insert is visible'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
