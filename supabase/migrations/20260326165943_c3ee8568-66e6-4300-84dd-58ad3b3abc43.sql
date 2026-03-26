INSERT INTO public.user_roles (user_id, role)
VALUES ('2fa5f703-831c-4aa0-8e3b-3e83aeb374b5', 'sales_executive')
ON CONFLICT (user_id, role) DO NOTHING;