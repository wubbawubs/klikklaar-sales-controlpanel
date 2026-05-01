
-- Already SET search_path = public in CREATE, but linter sometimes flags; re-affirm + lock execute
ALTER FUNCTION public.calls_to_funnel_events() SET search_path = public;
ALTER FUNCTION public.closer_appointments_to_funnel_events() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.calls_to_funnel_events() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.closer_appointments_to_funnel_events() FROM PUBLIC, anon, authenticated;
