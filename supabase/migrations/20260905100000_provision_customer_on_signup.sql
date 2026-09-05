-- Public Auth users are provisioned by the database, never by client metadata.
CREATE FUNCTION private.provision_customer_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  customer_role_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO customer_role_id
  FROM private.roles
  WHERE code = 'USER'
  LIMIT 1;

  IF customer_role_id IS NOT NULL THEN
    INSERT INTO private.user_roles (user_id, role_id, granted_by)
    VALUES (NEW.id, customer_role_id, NEW.id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.provision_customer_on_signup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.provision_customer_on_signup() TO postgres, service_role;

CREATE TRIGGER provision_customer_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.provision_customer_on_signup();
