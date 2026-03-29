
CREATE TABLE public.health_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_executive_id UUID REFERENCES public.sales_executives(id) ON DELETE CASCADE NOT NULL,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT,
  error_code TEXT,
  suggested_fix TEXT,
  notified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.health_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage health events"
  ON public.health_events FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'coach'::app_role));

CREATE POLICY "SEs can view own health events"
  ON public.health_events FOR SELECT
  TO authenticated
  USING (
    sales_executive_id IN (
      SELECT se.id FROM sales_executives se
      WHERE se.user_id = auth.uid()
        OR lower(se.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    )
  );

CREATE POLICY "Auth users can insert health events"
  ON public.health_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_health_events_se_type ON public.health_events(sales_executive_id, check_type, created_at DESC);
