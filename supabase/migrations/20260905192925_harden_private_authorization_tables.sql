-- Authorization catalog is server-owned. Keep it inaccessible to client roles
-- and enable RLS as defense in depth while preserving service_role access.
ALTER TABLE private.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.user_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.permissions FROM anon, authenticated;
REVOKE ALL ON TABLE private.role_permissions FROM anon, authenticated;
REVOKE ALL ON TABLE private.roles FROM anon, authenticated;
REVOKE ALL ON TABLE private.user_roles FROM anon, authenticated;
