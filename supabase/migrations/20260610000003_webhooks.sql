-- Webhook configurations (one per org, fires to Claude bot)
CREATE TABLE public.webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT, -- used to sign payloads
  events TEXT[] NOT NULL DEFAULT '{}',
  -- Supported events:
  -- deal.created, deal.stage_changed, deal.won, deal.lost
  -- contact.created, card.moved, card.created
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage webhooks" ON public.webhook_configs FOR ALL
  USING (public.is_admin(auth.uid()));
CREATE TRIGGER update_webhook_configs_updated_at BEFORE UPDATE ON public.webhook_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Webhook delivery log
CREATE TABLE public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES public.webhook_configs(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INT,
  response_body TEXT,
  delivered_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view webhook logs" ON public.webhook_logs FOR SELECT
  USING (public.is_admin(auth.uid()));
