-- Demo account: demo@one-group.nl / Demo1234!
-- Auth user created via Admin API (id: 86ac35f5-3c57-4f22-ad43-d81cf9f67a2c)
-- This migration wires up the profile, role, and org memberships

DO $$
DECLARE
  demo_id uuid := '86ac35f5-3c57-4f22-ad43-d81cf9f67a2c';
  kk_id   uuid;
  otr_id  uuid;
  oi_id   uuid;
BEGIN
  -- Profile
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (demo_id, 'Demo Admin', 'demo@one-group.nl')
  ON CONFLICT (user_id) DO NOTHING;

  -- Super admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (demo_id, 'super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Org memberships
  SELECT id INTO kk_id  FROM public.organizations WHERE slug = 'klikklaar';
  SELECT id INTO otr_id FROM public.organizations WHERE slug = 'one-time-recruit';
  SELECT id INTO oi_id  FROM public.organizations WHERE slug = 'one-idea';

  IF kk_id IS NOT NULL THEN
    INSERT INTO public.user_organizations (user_id, organization_id, role, is_default)
    VALUES (demo_id, kk_id, 'admin', true)
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END IF;

  IF otr_id IS NOT NULL THEN
    INSERT INTO public.user_organizations (user_id, organization_id, role, is_default)
    VALUES (demo_id, otr_id, 'admin', false)
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END IF;

  IF oi_id IS NOT NULL THEN
    INSERT INTO public.user_organizations (user_id, organization_id, role, is_default)
    VALUES (demo_id, oi_id, 'admin', false)
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END IF;

  RAISE NOTICE 'Demo account wired: demo@one-group.nl (id=%)', demo_id;
END $$;
