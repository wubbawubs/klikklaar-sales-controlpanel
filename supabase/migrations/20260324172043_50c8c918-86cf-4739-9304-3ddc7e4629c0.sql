
CREATE OR REPLACE FUNCTION public.handle_first_user_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If this is the first user, assign super_admin role
  IF (SELECT count(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'super_admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_first_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_first_user_admin();
