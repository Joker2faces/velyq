BEGIN;
SELECT plan(12);

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
  $$INSERT INTO public.profiles (user_id, display_name) VALUES ('70000000-0000-4000-8000-000000000010', 'Browser Insert')$$,
  '42501',
  NULL,
  'authenticated browser clients cannot insert profiles'
);
SELECT throws_ok(
  $$DELETE FROM public.profiles WHERE user_id = '00000000-0000-4000-8000-000000000001'$$,
  '42501',
  NULL,
  'authenticated browser clients cannot delete profiles'
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
  'the privileged server role can read all profiles'
);
SELECT is(
  (SELECT count(*) FROM private.roles),
  2::bigint,
  'the privileged server role can read internal authorization data'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
