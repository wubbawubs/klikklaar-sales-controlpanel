-- Run after stub_schema.sql + the migration. Every check raises on failure.
\set ON_ERROR_STOP on
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
INSERT INTO organizations VALUES ('10000000-0000-0000-0000-000000000001', 'Klikklaar');
INSERT INTO user_organizations (user_id, organization_id) VALUES
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001');
INSERT INTO profiles (user_id, full_name) VALUES ('00000000-0000-0000-0000-00000000000b', 'Sanne');
-- Two funnels. The second one's won/lost stages sit at lower positions: won/lost must stay within the deal's funnel.
-- Stage ...0003 is called 'Won' but typed open (and comes first): stage_type decides, not the name.
INSERT INTO funnels (id, org_id, name, position) VALUES
  ('15000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Sales pipeline', 0),
  ('15000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Partners', 1);
INSERT INTO pipeline_stages (id, org_id, funnel_id, name, position, stage_type) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002', 'Won', 1, 'won'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000002', 'Verloren', 2, 'lost'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'Won', 3, 'open'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'Voorstel', 4, 'open'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'Onderhandeling', 5, 'open'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'Won', 6, 'won'),
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'Verloren', 7, 'lost');
INSERT INTO companies (id, org_id, name) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Bakkerij Jansen');
INSERT INTO deals (id, org_id, company_id, stage_id, title, value_eur, assigned_to) VALUES
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'Website', 2500, '00000000-0000-0000-0000-00000000000a'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'SEO', 900, '00000000-0000-0000-0000-00000000000a');
INSERT INTO meeting_imports (id, org_id, meeting_date, transcript, status) VALUES
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-11-03', 'x', 'ready');
INSERT INTO meeting_proposals (id, org_id, import_id, position, kind, company_label, payload, expected, quote) VALUES
  ('60000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 0, 'note', 'Jansen', '{"body":"Twijfelt over prijs"}', NULL, 'twijfelt'),
  ('60000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 1, 'won', 'Jansen', '{}', '{"stage_id":"20000000-0000-0000-0000-000000000004","value_eur":2500,"assigned_to":"00000000-0000-0000-0000-00000000000a"}', 'getekend'),
  ('60000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 2, 'stage', 'Jansen', '{"stage_id":"20000000-0000-0000-0000-000000000005"}', '{"stage_id":"20000000-0000-0000-0000-000000000005","value_eur":900,"assigned_to":null}', 'onderhandeling'),
  ('60000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 3, 'stage', 'Jansen', '{"stage_id":"20000000-0000-0000-0000-000000000005"}', NULL, 'nog eens'),
  ('60000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 4, 'appointment', 'Jansen', '{"date":"2026-11-07","time":null,"user_id":"00000000-0000-0000-0000-00000000000a"}', NULL, 'belt vrijdag'),
  ('60000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 5, 'new_deal', 'Nieuw BV', '{"company_name":"Nieuw BV","deal_title":"SEO","stage_id":"20000000-0000-0000-0000-000000000004","contact_name":"Piet"}', NULL, 'nieuwe klant');

-- Proposals with an analysis snapshot always carry the deal it belongs to.
UPDATE meeting_proposals SET deal_id = '40000000-0000-0000-0000-000000000001' WHERE id = '60000000-0000-0000-0000-00000000000b';
UPDATE meeting_proposals SET deal_id = '40000000-0000-0000-0000-000000000002' WHERE id = '60000000-0000-0000-0000-00000000000c';
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);

DO $$
DECLARE r jsonb; d deals%ROWTYPE; n int;
  deal1 constant text := '40000000-0000-0000-0000-000000000001';
  deal2 constant text := '40000000-0000-0000-0000-000000000002';
BEGIN
  -- (a) note
  r := apply_meeting_proposal('60000000-0000-0000-0000-00000000000a', jsonb_build_object('deal_id', deal1, 'payload', '{"body":"Twijfelt over prijs"}'::jsonb));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION '(a) failed: %', r; END IF;
  SELECT count(*) INTO n FROM deal_activities WHERE deal_id = deal1::uuid AND body LIKE 'Uit sales-meeting 03-11-2026: Twijfelt%';
  IF n <> 1 THEN RAISE EXCEPTION '(a) activity missing'; END IF;
  RESET ROLE; SELECT count(*) INTO n FROM audit_logs WHERE action_type = 'meeting_proposal.note'; SET ROLE authenticated;
  IF n <> 1 THEN RAISE EXCEPTION '(a) audit missing'; END IF;

  -- (b) won
  r := apply_meeting_proposal('60000000-0000-0000-0000-00000000000b', jsonb_build_object('deal_id', deal1, 'payload', '{}'::jsonb));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION '(b) failed: %', r; END IF;
  SELECT * INTO d FROM deals WHERE id = deal1::uuid;
  IF d.stage_id <> '20000000-0000-0000-0000-000000000006' OR d.won_at IS NULL THEN RAISE EXCEPTION '(b) not won'; END IF;
  IF r->'events' @> '[{"event":"deal.won"}]' IS NOT TRUE THEN RAISE EXCEPTION '(b) no won event: %', r; END IF;

  -- (c) stale: expected Onderhandeling but deal2 is in Voorstel
  r := apply_meeting_proposal('60000000-0000-0000-0000-00000000000c', jsonb_build_object('deal_id', deal2, 'payload', '{"stage_id":"20000000-0000-0000-0000-000000000005"}'::jsonb));
  IF (r->>'ok')::boolean OR r->>'error' NOT LIKE '%gewijzigd%' THEN RAISE EXCEPTION '(c) expected stale error: %', r; END IF;
  SELECT * INTO d FROM deals WHERE id = deal2::uuid;
  IF d.stage_id <> '20000000-0000-0000-0000-000000000004' THEN RAISE EXCEPTION '(c) deal changed'; END IF;
  IF (SELECT status FROM meeting_proposals WHERE id = '60000000-0000-0000-0000-00000000000c') <> 'failed' THEN RAISE EXCEPTION '(c) not failed'; END IF;

  -- (d) closed deal needs confirmation; with confirmation it works
  r := apply_meeting_proposal('60000000-0000-0000-0000-00000000000d', jsonb_build_object('deal_id', deal1, 'payload', '{"stage_id":"20000000-0000-0000-0000-000000000005"}'::jsonb,
    'expected', jsonb_build_object('stage_id', '20000000-0000-0000-0000-000000000006')));
  IF (r->>'ok')::boolean OR r->>'error' NOT LIKE '%bevestig%' THEN RAISE EXCEPTION '(d) expected confirm error: %', r; END IF;
  r := apply_meeting_proposal('60000000-0000-0000-0000-00000000000d', jsonb_build_object('deal_id', deal1, 'payload', '{"stage_id":"20000000-0000-0000-0000-000000000005"}'::jsonb,
    'expected', jsonb_build_object('stage_id', '20000000-0000-0000-0000-000000000006'), 'confirm_closed', true));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION '(d) confirmed apply failed: %', r; END IF;
  SELECT * INTO d FROM deals WHERE id = deal1::uuid;
  IF d.won_at IS NOT NULL THEN RAISE EXCEPTION '(d) won_at not cleared'; END IF;

  -- (e) appointment without time fails, with time it works in Amsterdam time
  r := apply_meeting_proposal('60000000-0000-0000-0000-00000000000e', jsonb_build_object('deal_id', deal2, 'payload', '{"date":"2026-11-07","time":null,"user_id":"00000000-0000-0000-0000-00000000000a"}'::jsonb));
  IF (r->>'ok')::boolean OR r->>'error' NOT LIKE '%tijd%' THEN RAISE EXCEPTION '(e) expected time error: %', r; END IF;
  r := apply_meeting_proposal('60000000-0000-0000-0000-00000000000e', jsonb_build_object('deal_id', deal2, 'payload', '{"date":"2026-11-07","time":"10:30","user_id":"00000000-0000-0000-0000-00000000000a"}'::jsonb));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION '(e) apply failed: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM crm_appointments WHERE deal_id = deal2::uuid AND starts_at = '2026-11-07 09:30:00+00') THEN RAISE EXCEPTION '(e) wrong time'; END IF;

  -- (h) user picked another deal than the AI: stored snapshot (for deal1) must not be used for deal2
  UPDATE meeting_proposals SET deal_id = deal1::uuid, expected = '{"stage_id":"20000000-0000-0000-0000-000000000006","value_eur":2500,"assigned_to":null}'
    WHERE id = '60000000-0000-0000-0000-00000000000c';
  r := apply_meeting_proposal('60000000-0000-0000-0000-00000000000c', jsonb_build_object('deal_id', deal2, 'payload', '{"stage_id":"20000000-0000-0000-0000-000000000005"}'::jsonb,
    'expected', jsonb_build_object('stage_id', '20000000-0000-0000-0000-000000000004')));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION '(h) user-picked deal failed: %', r; END IF;

  -- (f) applying twice
  r := apply_meeting_proposal('60000000-0000-0000-0000-00000000000a', jsonb_build_object('deal_id', deal1, 'payload', '{"body":"nog eens"}'::jsonb));
  IF (r->>'ok')::boolean OR r->>'error' NOT LIKE '%al toegepast%' THEN RAISE EXCEPTION '(f) expected already applied: %', r; END IF;

  -- new deal
  r := apply_meeting_proposal('60000000-0000-0000-0000-00000000000f', jsonb_build_object('payload', '{"company_name":"Nieuw BV","deal_title":"SEO","stage_id":"20000000-0000-0000-0000-000000000004","contact_name":"Piet"}'::jsonb));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION '(new) failed: %', r; END IF;
  IF NOT EXISTS (SELECT 1 FROM deals dl JOIN companies c ON c.id = dl.company_id JOIN contacts k ON k.id = dl.contact_id WHERE c.name = 'Nieuw BV' AND k.name = 'Piet') THEN RAISE EXCEPTION '(new) not created'; END IF;
END $$;

-- (g) non-member
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
DO $$ BEGIN
  PERFORM apply_meeting_proposal('60000000-0000-0000-0000-00000000000c', '{}'::jsonb);
  RAISE EXCEPTION '(g) non-member was allowed';
EXCEPTION WHEN others THEN
  IF SQLERRM <> 'Geen toegang' THEN RAISE; END IF;
END $$;
RESET ROLE;
SELECT 'ALL CHECKS PASSED' AS result;

-- Claiming an import for (re-)analysis: only one run at a time, never after something was applied.
DO $$ DECLARE r text; BEGIN
  INSERT INTO meeting_imports (id, org_id, transcript) VALUES ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'y');
  IF (SELECT status FROM meeting_imports WHERE id = '50000000-0000-0000-0000-000000000002') <> 'queued' THEN RAISE EXCEPTION '(i) new import not queued'; END IF;
  r := claim_meeting_import('50000000-0000-0000-0000-000000000002');
  IF r <> 'ok' THEN RAISE EXCEPTION '(i) first claim: %', r; END IF;
  r := claim_meeting_import('50000000-0000-0000-0000-000000000002');
  IF r <> 'busy' THEN RAISE EXCEPTION '(i) second claim should be busy: %', r; END IF;
  UPDATE meeting_imports SET started_at = now() - interval '6 minutes' WHERE id = '50000000-0000-0000-0000-000000000002';
  r := claim_meeting_import('50000000-0000-0000-0000-000000000002');
  IF r <> 'ok' THEN RAISE EXCEPTION '(i) stuck run should be reclaimable: %', r; END IF;
  -- (j) import 1 has applied proposals
  r := claim_meeting_import('50000000-0000-0000-0000-000000000001');
  IF r <> 'applied' THEN RAISE EXCEPTION '(j) expected applied: %', r; END IF;
  IF (SELECT status FROM meeting_imports WHERE id = '50000000-0000-0000-0000-000000000001') <> 'ready' THEN RAISE EXCEPTION '(j) status changed'; END IF;
END $$;

-- (k) no applying while the import is being re-analysed
INSERT INTO meeting_proposals (id, org_id, import_id, position, kind, company_label, payload, quote) VALUES
  ('60000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 0, 'note', 'Jansen', '{"body":"x"}', 'x');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
DO $$ DECLARE r jsonb; BEGIN
  r := apply_meeting_proposal('60000000-0000-0000-0000-000000000010', jsonb_build_object('deal_id', '40000000-0000-0000-0000-000000000002', 'payload', '{"body":"x"}'::jsonb));
  IF (r->>'ok')::boolean OR r->>'error' NOT LIKE '%geanalyseerd%' THEN RAISE EXCEPTION '(k) expected busy error: %', r; END IF;
END $$;
-- claim is server-only
DO $$ BEGIN
  PERFORM claim_meeting_import('50000000-0000-0000-0000-000000000002');
  RAISE EXCEPTION '(l) authenticated user could claim';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;
SELECT 'CLAIM CHECKS PASSED' AS result;
