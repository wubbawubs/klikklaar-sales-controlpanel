
ALTER TABLE public.closer_appointments
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz;

CREATE OR REPLACE FUNCTION public.touch_closer_appointment_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.last_activity_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_closer_appointment_activity ON public.closer_appointments;
CREATE TRIGGER trg_touch_closer_appointment_activity
BEFORE UPDATE ON public.closer_appointments
FOR EACH ROW
EXECUTE FUNCTION public.touch_closer_appointment_activity();
