# QA Identities — Owner Action Required

**I cannot create or delete Supabase Auth users in this session.** There is
no Supabase MCP/tool connected here, and the only way to do it programmatically
is the Supabase Admin API with the **service-role key**, which this program
explicitly forbids requesting or using. Supabase's sign-up API creates a
real, permanent `auth.users` row I cannot remove without that key. The
Dashboard route the brief describes is real and correct — it just requires
the owner's own login to https://supabase.com/dashboard, which I don't have.

## Exact steps for the owner

1. **Create the three identities** — Supabase Dashboard → your project
   (`zvdqkmevjfwprexshpap`) → Authentication → Users → "Add user" → "Create
   new user":
   - `qa-free@velyq-test.internal` (or any address you control) — set a password
   - `qa-pro@velyq-test.internal`
   - `qa-elite@velyq-test.internal`
2. **Assign roles/plan state** — these are database rows, not auth rows.
   For each user, in the SQL editor (or Table editor):
   ```sql
   -- customer.read permission (adjust to your actual role/permission tables)
   insert into private.user_roles (user_id, role_id, granted_by, granted_at)
   select '<qa-user-uuid>'::uuid, r.id, '<qa-user-uuid>'::uuid, now()
   from private.roles r where r.code = 'USER'
   on conflict do nothing;

   -- plan state (adjust to your actual subscriptions table/columns)
   insert into private.subscriptions (user_id, plan_code, status)
   values ('<qa-user-uuid>', 'FREE', 'active')  -- 'PRO' / 'ELITE' for the others
   on conflict (user_id) do update set plan_code = excluded.plan_code;
   ```
   Confirm none of the three has an `admin.access` grant.
3. **Run QA** using each identity's email/password against
   `https://velyq-poc.joker2face1990.workers.dev/sign-in` — see
   `docs/release/entitlement-qa-checklist.md` for what to check.
4. **Clean up** — Authentication → Users → select the `qa-*` user → Delete.
   This also removes their `auth.users` row; any `private.subscriptions` /
   `private.user_roles` rows you inserted for them should be deleted in the
   same pass (they reference the deleted `user_id` and become orphaned
   otherwise) — the SQL above's tables, filtered `where user_id = '<qa-user-uuid>'`.

Nothing above touches a real customer identity, and no step here was
performed on the owner's behalf — this file only documents what the owner
can do with their own Dashboard access.
