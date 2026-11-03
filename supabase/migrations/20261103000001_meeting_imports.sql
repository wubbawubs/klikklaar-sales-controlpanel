-- Meeting verwerken: transcript → AI-voorstellen → per voorstel toepassen.

CREATE TABLE IF NOT EXISTS public.meeting_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  title text,
  meeting_date date NOT NULL DEFAULT current_date,
  transcript text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','analyzing','ready','failed')),
  error text,
  started_at timestamptz,
  analyzed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_imports_org_idx ON public.meeting_imports (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.meeting_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES public.meeting_imports(id) ON DELETE CASCADE,
  position int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('stage','won','lost','note','value','owner','appointment','new_deal')),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  company_label text NOT NULL,
  candidates jsonb NOT NULL DEFAULT '[]',
  payload jsonb NOT NULL DEFAULT '{}',
  expected jsonb,
  quote text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','dismissed','failed')),
  error text,
  applied_at timestamptz,
  applied_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_proposals_import_idx ON public.meeting_proposals (import_id, position);

ALTER TABLE public.meeting_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage meeting imports" ON public.meeting_imports;
CREATE POLICY "Org members manage meeting imports" ON public.meeting_imports FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Org members manage meeting proposals" ON public.meeting_proposals;
CREATE POLICY "Org members manage meeting proposals" ON public.meeting_proposals FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()));

-- Applies one proposal atomically. Runs as definer so it can write audit_logs (admin-only for normal users).
-- Never applies on stale data: if the deal changed since the analysis, it fails with a clear message.
CREATE OR REPLACE FUNCTION public.apply_meeting_proposal(p_proposal_id uuid, p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prop meeting_proposals%ROWTYPE;
  v_imp meeting_imports%ROWTYPE;
  v_payload jsonb := coalesce(p_input->'payload', '{}'::jsonb);
  v_company_id uuid := nullif(p_input->>'company_id', '')::uuid;
  v_deal_id uuid := nullif(p_input->>'deal_id', '')::uuid;
  v_confirm boolean := coalesce((p_input->>'confirm_closed')::boolean, false);
  v_exp jsonb;
  v_deal deals%ROWTYPE;
  v_after deals%ROWTYPE;
  v_from_stage pipeline_stages%ROWTYPE;
  v_to_stage pipeline_stages%ROWTYPE;
  v_from_kind text;
  v_to_kind text;
  v_suffix text;
  v_meta jsonb;
  v_events jsonb := '[]'::jsonb;
  v_before jsonb;
  v_after_json jsonb;
  v_text text;
  v_num numeric;
  v_user uuid;
  v_name text;
  v_appt crm_appointments%ROWTYPE;
  v_new_company uuid;
  v_new_contact uuid;
  v_err text;
BEGIN
  SELECT * INTO v_prop FROM meeting_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voorstel niet gevonden'; END IF;
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM user_organizations WHERE user_id = v_uid AND organization_id = v_prop.org_id
  ) THEN RAISE EXCEPTION 'Geen toegang'; END IF;
  IF v_prop.status = 'applied' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Dit voorstel is al toegepast');
  END IF;

  SELECT * INTO v_imp FROM meeting_imports WHERE id = v_prop.import_id;
  IF v_imp.status <> 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Deze meeting wordt opnieuw geanalyseerd — wacht tot dat klaar is');
  END IF;
  v_suffix := ' (uit sales-meeting ' || to_char(v_imp.meeting_date, 'DD-MM-YYYY') || ')';
  v_meta := jsonb_build_object('source', 'meeting', 'meeting_import_id', v_prop.import_id, 'proposal_id', v_prop.id);

  BEGIN
    IF v_prop.kind <> 'new_deal' THEN
      SELECT * INTO v_deal FROM deals WHERE id = v_deal_id AND org_id = v_prop.org_id FOR UPDATE;
      IF NOT FOUND OR (v_company_id IS NOT NULL AND v_deal.company_id IS DISTINCT FROM v_company_id) THEN
        RAISE EXCEPTION 'Kies een deal';
      END IF;
      v_before := to_jsonb(v_deal);

      -- Stale check on the field this kind changes.
      -- The analysis snapshot only applies to the deal the AI picked; for a deal chosen by the user, use what the screen showed.
      v_exp := CASE WHEN v_prop.deal_id IS NOT DISTINCT FROM v_deal.id AND v_prop.expected IS NOT NULL
                    THEN v_prop.expected ELSE p_input->'expected' END;
      IF v_exp IS NOT NULL AND (
           (v_prop.kind IN ('stage','won','lost') AND v_deal.stage_id IS DISTINCT FROM nullif(v_exp->>'stage_id','')::uuid)
        OR (v_prop.kind = 'value' AND v_deal.value_eur IS DISTINCT FROM nullif(v_exp->>'value_eur','')::numeric)
        OR (v_prop.kind = 'owner' AND v_deal.assigned_to IS DISTINCT FROM nullif(v_exp->>'assigned_to','')::uuid)
      ) THEN
        RAISE EXCEPTION 'Deal is sinds de analyse gewijzigd — controleer en doe dit handmatig';
      END IF;

      SELECT * INTO v_from_stage FROM pipeline_stages WHERE id = v_deal.stage_id;
      v_from_kind := CASE lower(trim(coalesce(v_from_stage.name, '')))
        WHEN 'won' THEN 'won' WHEN 'gewonnen' THEN 'won' WHEN 'verloren' THEN 'lost' WHEN 'lost' THEN 'lost' END;
      IF v_prop.kind IN ('stage','won','lost') AND v_from_kind IS NOT NULL AND NOT v_confirm THEN
        RAISE EXCEPTION 'Deal is al gewonnen of verloren — bevestig eerst';
      END IF;
    END IF;

    IF v_prop.kind IN ('stage','won','lost') THEN
      IF v_prop.kind = 'stage' THEN
        SELECT * INTO v_to_stage FROM pipeline_stages
          WHERE id = nullif(v_payload->>'stage_id','')::uuid AND org_id = v_prop.org_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Kies een fase'; END IF;
      ELSE
        SELECT * INTO v_to_stage FROM pipeline_stages
          WHERE org_id = v_prop.org_id AND lower(trim(name)) = ANY (
            CASE WHEN v_prop.kind = 'won' THEN ARRAY['won','gewonnen'] ELSE ARRAY['verloren','lost'] END)
          ORDER BY position LIMIT 1;
        IF NOT FOUND THEN
          RAISE EXCEPTION '%', CASE WHEN v_prop.kind = 'won' THEN 'Geen gewonnen-fase gevonden' ELSE 'Geen verloren-fase gevonden' END;
        END IF;
      END IF;
      v_to_kind := CASE lower(trim(v_to_stage.name))
        WHEN 'won' THEN 'won' WHEN 'gewonnen' THEN 'won' WHEN 'verloren' THEN 'lost' WHEN 'lost' THEN 'lost' END;

      UPDATE deals SET
        stage_id = v_to_stage.id,
        stage_updated_at = now(),
        won_at = CASE WHEN v_to_kind = 'won' THEN now() ELSE NULL END,
        lost_at = CASE WHEN v_to_kind = 'lost' THEN now() ELSE NULL END,
        lost_reason = CASE WHEN v_to_kind = 'lost' THEN nullif(trim(coalesce(v_payload->>'lost_reason', '')), '') ELSE NULL END
      WHERE id = v_deal.id RETURNING * INTO v_after;

      INSERT INTO deal_activities (org_id, deal_id, type, body, meta, created_by)
      VALUES (v_prop.org_id, v_deal.id, 'stage_change',
        'Verplaatst van "' || coalesce(v_from_stage.name, '—') || '" naar "' || v_to_stage.name || '"' || v_suffix
          || CASE WHEN v_to_kind = 'lost' AND v_after.lost_reason IS NOT NULL THEN ' — reden: ' || v_after.lost_reason ELSE '' END,
        v_meta || jsonb_build_object('from_stage', v_from_stage.name, 'to_stage', v_to_stage.name), v_uid);

      v_events := v_events || jsonb_build_array(jsonb_build_object('event', 'deal.stage_changed', 'payload',
        jsonb_build_object('deal_id', v_deal.id, 'from_stage', v_from_stage.name, 'to_stage', v_to_stage.name)));
      IF v_to_kind = 'won' THEN
        v_events := v_events || jsonb_build_array(jsonb_build_object('event', 'deal.won', 'payload', jsonb_build_object('deal_id', v_deal.id)));
      ELSIF v_to_kind = 'lost' THEN
        v_events := v_events || jsonb_build_array(jsonb_build_object('event', 'deal.lost', 'payload', jsonb_build_object('deal_id', v_deal.id)));
      END IF;
      v_after_json := to_jsonb(v_after);

    ELSIF v_prop.kind = 'value' THEN
      v_num := nullif(v_payload->>'value_eur', '')::numeric;
      IF v_num IS NULL OR v_num <= 0 THEN RAISE EXCEPTION 'Vul een bedrag in'; END IF;
      UPDATE deals SET value_eur = v_num WHERE id = v_deal.id RETURNING * INTO v_after;
      INSERT INTO deal_activities (org_id, deal_id, type, body, meta, created_by)
      VALUES (v_prop.org_id, v_deal.id, 'note',
        'Waarde aangepast van ' || coalesce('€' || v_deal.value_eur::text, '—') || ' naar €' || v_num::text || v_suffix, v_meta, v_uid);
      v_after_json := to_jsonb(v_after);

    ELSIF v_prop.kind = 'owner' THEN
      v_user := nullif(v_payload->>'user_id', '')::uuid;
      IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM user_organizations WHERE user_id = v_user AND organization_id = v_prop.org_id) THEN
        RAISE EXCEPTION 'Kies een eigenaar';
      END IF;
      SELECT coalesce(full_name, email, 'onbekend') INTO v_name FROM profiles WHERE user_id = v_user;
      UPDATE deals SET assigned_to = v_user WHERE id = v_deal.id RETURNING * INTO v_after;
      INSERT INTO deal_activities (org_id, deal_id, type, body, meta, created_by)
      VALUES (v_prop.org_id, v_deal.id, 'note', 'Eigenaar gewijzigd naar ' || coalesce(v_name, 'onbekend') || v_suffix, v_meta, v_uid);
      v_after_json := to_jsonb(v_after);

    ELSIF v_prop.kind = 'note' THEN
      v_text := nullif(trim(coalesce(v_payload->>'body', '')), '');
      IF v_text IS NULL THEN RAISE EXCEPTION 'Notitie is leeg'; END IF;
      INSERT INTO deal_activities (org_id, deal_id, type, body, meta, created_by)
      VALUES (v_prop.org_id, v_deal.id, 'note',
        'Uit sales-meeting ' || to_char(v_imp.meeting_date, 'DD-MM-YYYY') || ': ' || v_text, v_meta, v_uid);
      v_after_json := v_before;

    ELSIF v_prop.kind = 'appointment' THEN
      v_user := nullif(v_payload->>'user_id', '')::uuid;
      IF coalesce(v_payload->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Kies een datum'; END IF;
      IF coalesce(v_payload->>'time', '') !~ '^\d{2}:\d{2}$' THEN RAISE EXCEPTION 'Vul een tijd in'; END IF;
      IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM user_organizations WHERE user_id = v_user AND organization_id = v_prop.org_id) THEN
        RAISE EXCEPTION 'Kies een eigenaar';
      END IF;
      INSERT INTO crm_appointments (org_id, deal_id, company_id, contact_id, owner_id, type, title, starts_at, notes, created_by)
      VALUES (v_prop.org_id, v_deal.id, v_deal.company_id, v_deal.contact_id, v_user,
        CASE WHEN v_payload->>'appointment_type' = 'meeting' THEN 'meeting' ELSE 'call' END,
        coalesce(nullif(trim(coalesce(v_payload->>'title', '')), ''), 'Opvolging'),
        ((v_payload->>'date') || ' ' || (v_payload->>'time'))::timestamp AT TIME ZONE 'Europe/Amsterdam',
        'Uit sales-meeting ' || to_char(v_imp.meeting_date, 'DD-MM-YYYY') || coalesce(': ' || nullif(v_prop.quote, ''), ''),
        v_uid)
      RETURNING * INTO v_appt;
      v_after_json := to_jsonb(v_appt);

    ELSIF v_prop.kind = 'new_deal' THEN
      IF nullif(trim(coalesce(v_payload->>'company_name', '')), '') IS NULL THEN RAISE EXCEPTION 'Vul een bedrijfsnaam in'; END IF;
      IF nullif(trim(coalesce(v_payload->>'deal_title', '')), '') IS NULL THEN RAISE EXCEPTION 'Vul een dealnaam in'; END IF;
      SELECT * INTO v_to_stage FROM pipeline_stages
        WHERE id = nullif(v_payload->>'stage_id','')::uuid AND org_id = v_prop.org_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Kies een fase'; END IF;
      v_num := nullif(v_payload->>'value_eur', '')::numeric;
      IF v_num IS NOT NULL AND v_num <= 0 THEN v_num := NULL; END IF;

      INSERT INTO companies (org_id, name, source)
      VALUES (v_prop.org_id, trim(v_payload->>'company_name'), 'sales-meeting')
      RETURNING id INTO v_new_company;
      IF nullif(trim(coalesce(v_payload->>'contact_name', '')), '') IS NOT NULL THEN
        INSERT INTO contacts (org_id, company_id, name) VALUES (v_prop.org_id, v_new_company, trim(v_payload->>'contact_name'))
        RETURNING id INTO v_new_contact;
      END IF;
      INSERT INTO deals (org_id, company_id, contact_id, stage_id, title, value_eur, assigned_to, created_by)
      VALUES (v_prop.org_id, v_new_company, v_new_contact, v_to_stage.id, trim(v_payload->>'deal_title'), v_num, v_uid, v_uid)
      RETURNING * INTO v_after;
      v_deal := v_after;
      v_company_id := v_new_company;
      v_text := nullif(trim(coalesce(v_payload->>'body', '')), '');
      INSERT INTO deal_activities (org_id, deal_id, type, body, meta, created_by)
      VALUES (v_prop.org_id, v_after.id, 'note',
        'Aangemaakt uit sales-meeting ' || to_char(v_imp.meeting_date, 'DD-MM-YYYY') || coalesce(': ' || v_text, ''), v_meta, v_uid);
      v_events := v_events || jsonb_build_array(jsonb_build_object('event', 'deal.created', 'payload',
        jsonb_build_object('deal_id', v_after.id, 'title', v_after.title)));
      v_before := NULL;
      v_after_json := to_jsonb(v_after);
    END IF;

    INSERT INTO audit_logs (actor_user_id, action_type, entity_type, entity_id, before_json, after_json)
    VALUES (v_uid, 'meeting_proposal.' || v_prop.kind,
      CASE WHEN v_prop.kind = 'appointment' THEN 'crm_appointment' ELSE 'deal' END,
      CASE WHEN v_prop.kind = 'appointment' THEN v_appt.id::text ELSE v_deal.id::text END,
      v_before, v_after_json);

    UPDATE meeting_proposals SET
      status = 'applied', applied_at = now(), applied_by = v_uid, error = NULL,
      payload = v_payload, deal_id = v_deal.id, company_id = coalesce(v_company_id, v_deal.company_id)
    WHERE id = v_prop.id;

    RETURN jsonb_build_object('ok', true, 'deal_id', v_deal.id, 'events', v_events);
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    UPDATE meeting_proposals SET status = 'failed', error = v_err WHERE id = v_prop.id;
    RETURN jsonb_build_object('ok', false, 'error', v_err);
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_meeting_proposal(uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_meeting_proposal(uuid, jsonb) TO authenticated;

-- Claims an import for (re-)analysis. Server-only (edge function with service role).
-- One run at a time; a run that has been 'analyzing' for over 5 minutes is considered dead and may be reclaimed.
-- Never re-analyses once something was applied, so applied changes are not proposed twice.
CREATE OR REPLACE FUNCTION public.claim_meeting_import(p_import_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE meeting_imports SET status = 'analyzing', error = NULL, started_at = now()
  WHERE id = p_import_id
    AND (status IN ('queued','failed','ready') OR (status = 'analyzing' AND started_at < now() - interval '5 minutes'))
    AND NOT EXISTS (SELECT 1 FROM meeting_proposals WHERE import_id = p_import_id AND status = 'applied')
  RETURNING id INTO v_id;
  IF v_id IS NOT NULL THEN
    DELETE FROM meeting_proposals WHERE import_id = p_import_id;
    RETURN 'ok';
  END IF;
  IF EXISTS (SELECT 1 FROM meeting_proposals WHERE import_id = p_import_id AND status = 'applied') THEN RETURN 'applied'; END IF;
  IF NOT EXISTS (SELECT 1 FROM meeting_imports WHERE id = p_import_id) THEN RETURN 'not_found'; END IF;
  RETURN 'busy';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_meeting_import(uuid) FROM public, anon, authenticated;
