-- bunq API handshake state (keypair, installation token, user id). Service-role
-- only: RLS on with no policies, so only the edge function (service key) can read
-- it. bunq tokens never reach the browser.
CREATE TABLE IF NOT EXISTS public.bunq_state (
  id int PRIMARY KEY DEFAULT 1,
  private_key text,
  public_key text,
  installation_token text,
  user_id text,
  last_sync timestamptz,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT bunq_state_singleton CHECK (id = 1)
);
ALTER TABLE public.bunq_state ENABLE ROW LEVEL SECURITY;
