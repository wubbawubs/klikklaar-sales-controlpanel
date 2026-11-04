-- Run after live schema + fixtures + new migrations. Every check raises on failure.
-- Login simulation helper for later checks:
--   SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
--   SET LOCAL ROLE authenticated;  (inside a transaction; RESET ROLE afterwards)

DO $$ BEGIN
  IF (SELECT count(*) FROM deals) <> 7 THEN RAISE EXCEPTION 'check fixtures: expected 7 deals'; END IF;
  IF (SELECT coalesce(sum(value_eur),0) FROM deals WHERE org_id='10000000-0000-0000-0000-00000000000a') <> 11500 THEN RAISE EXCEPTION 'check fixtures: org L value sum'; END IF;
END $$;

-- login simulation sanity: auth.uid() must follow request.jwt.claims
DO $$ DECLARE v uuid; BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true);
  v := auth.uid();
  IF v IS DISTINCT FROM '00000000-0000-0000-0000-0000000000a2'::uuid THEN RAISE EXCEPTION 'check auth.uid: got %', v; END IF;
END $$;

-- smoke: grants + RLS work under the login simulation (u_member sees org L's 5 deals only)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM deals) <> 5 THEN RAISE EXCEPTION 'check rls_smoke: member sees % deals, expected 5', (SELECT count(*) FROM deals); END IF;
  IF EXISTS (SELECT 1 FROM deals WHERE org_id <> '10000000-0000-0000-0000-00000000000a') THEN RAISE EXCEPTION 'check rls_smoke: member sees other org deals'; END IF;
END $$;
ROLLBACK;

-- ===== Task 2: funnels, stage types =====
-- funnel_per_org
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT DISTINCT org_id FROM pipeline_stages LOOP
    IF (SELECT count(*) FROM funnels WHERE org_id = r.org_id) <> 1
       OR (SELECT count(*) FROM funnels WHERE org_id = r.org_id AND name = 'Sales pipeline') <> 1 THEN
      RAISE EXCEPTION 'check funnel_per_org: org % does not have exactly 1 "Sales pipeline" funnel', r.org_id;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pipeline_stages s WHERE s.funnel_id IS DISTINCT FROM (SELECT f.id FROM funnels f WHERE f.org_id = s.org_id)) THEN
    RAISE EXCEPTION 'check funnel_per_org: stage with wrong funnel_id';
  END IF;
  IF EXISTS (SELECT 1 FROM deals d WHERE d.funnel_id IS DISTINCT FROM (SELECT f.id FROM funnels f WHERE f.org_id = d.org_id)) THEN
    RAISE EXCEPTION 'check funnel_per_org: deal with wrong funnel_id';
  END IF;
END $$;

-- stage_types
DO $$ DECLARE v_max_old int; BEGIN
  IF (SELECT stage_type FROM pipeline_stages WHERE id='20000000-0000-0000-0000-0000000000a3') <> 'won' THEN RAISE EXCEPTION 'check stage_types: L Won'; END IF;
  IF (SELECT stage_type FROM pipeline_stages WHERE id='20000000-0000-0000-0000-0000000000a4') <> 'lost' THEN RAISE EXCEPTION 'check stage_types: L Verloren'; END IF;
  IF EXISTS (SELECT 1 FROM pipeline_stages WHERE id IN ('20000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-0000000000a2',
             '20000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-0000000000c2','20000000-0000-0000-0000-0000000000c3') AND stage_type <> 'open') THEN
    RAISE EXCEPTION 'check stage_types: open stages (incl. "Deal gewonnen") must stay open';
  END IF;
  IF (SELECT count(*) FROM pipeline_stages WHERE org_id='10000000-0000-0000-0000-00000000000a') <> 4 THEN RAISE EXCEPTION 'check stage_types: org L got extra stages'; END IF;
  SELECT max(position) INTO v_max_old FROM pipeline_stages WHERE id IN ('20000000-0000-0000-0000-0000000000c1','20000000-0000-0000-0000-0000000000c2','20000000-0000-0000-0000-0000000000c3');
  IF (SELECT count(*) FROM pipeline_stages WHERE org_id='10000000-0000-0000-0000-00000000000c' AND name='Gewonnen' AND stage_type='won' AND position > v_max_old) <> 1
     OR (SELECT count(*) FROM pipeline_stages WHERE org_id='10000000-0000-0000-0000-00000000000c' AND name='Verloren' AND stage_type='lost' AND position > v_max_old) <> 1
     OR (SELECT count(*) FROM pipeline_stages WHERE org_id='10000000-0000-0000-0000-00000000000c') <> 5 THEN
    RAISE EXCEPTION 'check stage_types: org C must gain exactly Gewonnen(won) + Verloren(lost) after its last stage';
  END IF;
END $$;

-- null_stage_deal
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM deals d JOIN funnels f ON f.id = d.funnel_id
                 WHERE d.id='40000000-0000-0000-0000-0000000000a4' AND d.stage_id IS NULL AND f.org_id='10000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'check null_stage_deal: deal a4 must keep NULL stage_id and get org L funnel';
  END IF;
END $$;

-- counts_unchanged (hand-computed totals from fixtures.sql header)
DO $$ DECLARE l jsonb; c jsonb; BEGIN
  l := crm_integrity_counts('10000000-0000-0000-0000-00000000000a');
  c := crm_integrity_counts('10000000-0000-0000-0000-00000000000c');
  IF (l->>'deals')::int <> 5 OR (l->>'deals_value_sum')::numeric <> 11500 OR (l->>'deals_won')::int <> 0 OR (l->>'deals_lost')::int <> 1
     OR (l->>'companies')::int <> 2 OR (l->>'contacts')::int <> 3 OR (l->>'deal_activities')::int <> 4 OR (l->>'crm_appointments')::int <> 2
     OR (l->>'deal_fees')::int <> 2 OR (l->>'deal_fees_sum')::numeric <> 450 OR (l->>'company_items')::int <> 1 OR (l->>'stages')::int <> 4 THEN
    RAISE EXCEPTION 'check counts_unchanged: org L counts %', l;
  END IF;
  IF (c->>'deals')::int <> 2 OR (c->>'deals_value_sum')::numeric <> 2000 OR (c->>'deals_won')::int <> 0 OR (c->>'deals_lost')::int <> 0
     OR (c->>'stages')::int <> 5 THEN
    RAISE EXCEPTION 'check counts_unchanged: org C counts %', c;
  END IF;
  -- deals rows themselves unchanged apart from funnel_id (incl. updated_at: backfill must not touch it)
  IF EXISTS (SELECT 1 FROM crm_backup_20261104.deals b JOIN deals d USING (id)
             WHERE (b.org_id, b.stage_id, b.title, b.value_eur, b.won_at, b.lost_at, b.updated_at, b.stage_updated_at)
                   IS DISTINCT FROM (d.org_id, d.stage_id, d.title, d.value_eur, d.won_at, d.lost_at, d.updated_at, d.stage_updated_at)) THEN
    RAISE EXCEPTION 'check counts_unchanged: deal rows changed by migration';
  END IF;
END $$;

-- crm_integrity_counts is an ops tool: not callable by app roles
DO $$ BEGIN
  IF has_function_privilege('authenticated', 'public.crm_integrity_counts(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.crm_integrity_counts(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'check counts_fn_private: crm_integrity_counts executable by app roles';
  END IF;
END $$;

-- backup_exists
DO $$ BEGIN
  IF (SELECT count(*) FROM crm_backup_20261104.deals) <> 7 THEN RAISE EXCEPTION 'check backup_exists: deals backup rows'; END IF;
  IF (SELECT count(*) FROM crm_backup_20261104.pipeline_stages) <> 7 OR (SELECT count(*) FROM crm_backup_20261104.deal_fees) <> 2
     OR (SELECT count(*) FROM crm_backup_20261104.companies) <> 2 OR (SELECT count(*) FROM crm_backup_20261104.contacts) <> 3
     OR (SELECT count(*) FROM crm_backup_20261104.deal_activities) <> 4 OR (SELECT count(*) FROM crm_backup_20261104.crm_appointments) <> 2
     OR (SELECT count(*) FROM crm_backup_20261104.company_items) <> 1 THEN
    RAISE EXCEPTION 'check backup_exists: other backup tables';
  END IF;
END $$;

-- stage_funnel_match (+ funnel default on insert). Leaves fixtures unchanged: every write is rolled back.
DO $$ DECLARE ok boolean := false; v_f uuid; BEGIN
  BEGIN
    INSERT INTO deals (org_id, funnel_id, stage_id, title)
    VALUES ('10000000-0000-0000-0000-00000000000a', (SELECT id FROM funnels WHERE org_id='10000000-0000-0000-0000-00000000000a'),
            '20000000-0000-0000-0000-0000000000c1', 'cross-funnel');
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%Fase hoort niet bij deze funnel%' THEN ok := true; ELSE RAISE; END IF;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check stage_funnel_match: cross-funnel insert was accepted'; END IF;

  ok := false;
  BEGIN
    UPDATE deals SET stage_id = '20000000-0000-0000-0000-0000000000c1' WHERE id = '40000000-0000-0000-0000-0000000000a1';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%Fase hoort niet bij deze funnel%' THEN ok := true; ELSE RAISE; END IF;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check stage_funnel_match: cross-funnel update was accepted'; END IF;

  -- funnel_id default: from the stage, else the org's funnel. Rolled back via sentinel exception.
  BEGIN
    INSERT INTO deals (org_id, stage_id, title) VALUES ('10000000-0000-0000-0000-00000000000c','20000000-0000-0000-0000-0000000000c1','dflt1')
      RETURNING funnel_id INTO v_f;
    IF v_f IS DISTINCT FROM (SELECT funnel_id FROM pipeline_stages WHERE id='20000000-0000-0000-0000-0000000000c1') THEN
      RAISE EXCEPTION 'check funnel_default: stage funnel not used';
    END IF;
    INSERT INTO deals (org_id, title) VALUES ('10000000-0000-0000-0000-00000000000a','dflt2') RETURNING funnel_id INTO v_f;
    IF v_f IS DISTINCT FROM (SELECT id FROM funnels WHERE org_id='10000000-0000-0000-0000-00000000000a') THEN
      RAISE EXCEPTION 'check funnel_default: org funnel not used';
    END IF;
    RAISE EXCEPTION 'rollback_sentinel';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'rollback_sentinel' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM deals) <> 7 THEN RAISE EXCEPTION 'check stage_funnel_match: fixtures changed'; END IF;
END $$;

-- seed_default_stages creates a funnel and typed stages (rolled back)
DO $$ DECLARE v_org uuid := gen_random_uuid(); BEGIN
  BEGIN
    INSERT INTO organizations (id, slug, name) VALUES (v_org, 'seedtest', 'Seed test');
    PERFORM seed_default_stages(v_org);
    IF (SELECT count(*) FROM funnels WHERE org_id = v_org) <> 1 THEN RAISE EXCEPTION 'check seed: funnel'; END IF;
    IF EXISTS (SELECT 1 FROM pipeline_stages s WHERE s.org_id = v_org AND s.funnel_id IS DISTINCT FROM (SELECT id FROM funnels WHERE org_id = v_org)) THEN
      RAISE EXCEPTION 'check seed: stage funnel_id';
    END IF;
    IF (SELECT stage_type FROM pipeline_stages WHERE org_id = v_org AND name = 'Won') <> 'won'
       OR (SELECT stage_type FROM pipeline_stages WHERE org_id = v_org AND name = 'Verloren') <> 'lost'
       OR (SELECT count(*) FROM pipeline_stages WHERE org_id = v_org AND stage_type = 'open') <> 5 THEN
      RAISE EXCEPTION 'check seed: stage types';
    END IF;
    RAISE EXCEPTION 'rollback_sentinel';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'rollback_sentinel' THEN RAISE; END IF;
  END;
END $$;

-- stage_type_on_insert: name-only inserts (as today's frontend seeds) get typed by exact name; rolled back
DO $$ BEGIN
  BEGIN
    INSERT INTO pipeline_stages (org_id, name, position) VALUES
      ('10000000-0000-0000-0000-00000000000c', ' Won ', 10), ('10000000-0000-0000-0000-00000000000c', 'verloren', 11),
      ('10000000-0000-0000-0000-00000000000c', 'Deal gewonnen 2', 12);
    INSERT INTO pipeline_stages (org_id, name, position, stage_type) VALUES ('10000000-0000-0000-0000-00000000000c', 'Gewonnen', 13, 'lost');
    IF (SELECT stage_type FROM pipeline_stages WHERE org_id='10000000-0000-0000-0000-00000000000c' AND position=10) <> 'won'
       OR (SELECT stage_type FROM pipeline_stages WHERE org_id='10000000-0000-0000-0000-00000000000c' AND position=11) <> 'lost'
       OR (SELECT stage_type FROM pipeline_stages WHERE org_id='10000000-0000-0000-0000-00000000000c' AND position=12) <> 'open'
       OR (SELECT stage_type FROM pipeline_stages WHERE org_id='10000000-0000-0000-0000-00000000000c' AND position=13) <> 'lost' THEN
      RAISE EXCEPTION 'check stage_type_on_insert: wrong typing';
    END IF;
    RAISE EXCEPTION 'rollback_sentinel';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'rollback_sentinel' THEN RAISE; END IF;
  END;
END $$;

-- seed_as_member: a non-admin member can seed stages for an org without funnel (trigger creates it)
BEGIN;
INSERT INTO organizations (id, slug, name) VALUES ('10000000-0000-0000-0000-0000000000ee', 'seedmember', 'Seed member');
INSERT INTO user_organizations (user_id, organization_id, is_default) VALUES ('00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-0000000000ee', false);
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM seed_default_stages('10000000-0000-0000-0000-0000000000ee');
  IF (SELECT count(*) FROM funnels WHERE org_id='10000000-0000-0000-0000-0000000000ee') <> 1
     OR (SELECT count(*) FROM pipeline_stages WHERE org_id='10000000-0000-0000-0000-0000000000ee') <> 7
     OR EXISTS (SELECT 1 FROM pipeline_stages s WHERE s.org_id='10000000-0000-0000-0000-0000000000ee'
                AND s.funnel_id IS DISTINCT FROM (SELECT id FROM funnels WHERE org_id='10000000-0000-0000-0000-0000000000ee')) THEN
    RAISE EXCEPTION 'check seed_as_member: expected 1 funnel and 7 stages in it';
  END IF;
END $$;
ROLLBACK;

-- funnels RLS: member reads own org's funnel only and cannot create one; admin can
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ok boolean := false; BEGIN
  IF (SELECT count(*) FROM funnels) <> 1 OR EXISTS (SELECT 1 FROM funnels WHERE org_id <> '10000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'check funnels_rls: member must see only org L funnel';
  END IF;
  BEGIN
    INSERT INTO funnels (org_id, name) VALUES ('10000000-0000-0000-0000-00000000000a', 'Member funnel');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check funnels_rls: member could create a funnel'; END IF;
END $$;
ROLLBACK;
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  INSERT INTO funnels (org_id, name) VALUES ('10000000-0000-0000-0000-00000000000c', 'Admin funnel');
END $$;
ROLLBACK;

-- ===== Task 3: won/lost from stage type =====
-- drag_to_won / drag_back_open / drag_to_lost (rolled back via sentinel)
DO $$ DECLARE d deals%ROWTYPE; v_first timestamptz; BEGIN
  BEGIN
    -- drag_to_won: Prospect -> Won sets won_at and stage_updated_at
    UPDATE deals SET stage_id = '20000000-0000-0000-0000-0000000000a3' WHERE id = '40000000-0000-0000-0000-0000000000a1' RETURNING * INTO d;
    IF d.won_at IS NULL THEN RAISE EXCEPTION 'check drag_to_won: won_at NULL'; END IF;
    IF d.lost_at IS NOT NULL THEN RAISE EXCEPTION 'check drag_to_won: lost_at set'; END IF;
    IF d.stage_updated_at IS DISTINCT FROM now() THEN RAISE EXCEPTION 'check drag_to_won: stage_updated_at not bumped'; END IF;
    -- drag_back_open: Won -> Prospect clears won_at
    UPDATE deals SET stage_id = '20000000-0000-0000-0000-0000000000a1' WHERE id = '40000000-0000-0000-0000-0000000000a1' RETURNING * INTO d;
    IF d.won_at IS NOT NULL OR d.lost_at IS NOT NULL THEN RAISE EXCEPTION 'check drag_back_open: won_at/lost_at not cleared'; END IF;
    -- drag_to_lost: sets lost_at, clears won_at
    UPDATE deals SET stage_id = '20000000-0000-0000-0000-0000000000a3' WHERE id = '40000000-0000-0000-0000-0000000000a1';
    UPDATE deals SET stage_id = '20000000-0000-0000-0000-0000000000a4' WHERE id = '40000000-0000-0000-0000-0000000000a1' RETURNING * INTO d;
    IF d.lost_at IS NULL OR d.won_at IS NOT NULL THEN RAISE EXCEPTION 'check drag_to_lost: lost_at/won_at wrong'; END IF;
    -- won_at kept when an explicit value is written together with a won stage
    UPDATE deals SET stage_id = '20000000-0000-0000-0000-0000000000a3', won_at = '2026-01-01T00:00:00Z'
      WHERE id = '40000000-0000-0000-0000-0000000000a1' RETURNING * INTO d;
    IF d.won_at <> '2026-01-01T00:00:00Z'::timestamptz OR d.lost_at IS NOT NULL THEN RAISE EXCEPTION 'check drag_to_won: explicit won_at not kept'; END IF;
    -- deal d3 keeps its historic lost_at when re-saved into the same lost stage
    UPDATE deals SET stage_id = stage_id WHERE id = '40000000-0000-0000-0000-0000000000a3' RETURNING * INTO d;
    IF d.lost_at <> '2026-10-01T10:00:00Z'::timestamptz THEN RAISE EXCEPTION 'check same_stage: lost_at changed'; END IF;
    -- deal d2 (Won, NULL won_at) stays NULL when the stage does not change
    UPDATE deals SET stage_id = stage_id, title = title WHERE id = '40000000-0000-0000-0000-0000000000a2' RETURNING * INTO d;
    IF d.won_at IS NOT NULL THEN RAISE EXCEPTION 'check same_stage: won_at backfilled without a stage change'; END IF;
    -- moving to NULL stage (as ON DELETE SET NULL does) leaves outcome fields alone
    UPDATE deals SET stage_id = NULL WHERE id = '40000000-0000-0000-0000-0000000000a3' RETURNING * INTO d;
    IF d.lost_at <> '2026-10-01T10:00:00Z'::timestamptz THEN RAISE EXCEPTION 'check null_stage: lost_at changed'; END IF;
    -- insert straight into a won stage gets won_at
    INSERT INTO deals (org_id, stage_id, title) VALUES ('10000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-0000000000a3','ins-won')
      RETURNING * INTO d;
    IF d.won_at IS NULL THEN RAISE EXCEPTION 'check insert_won: won_at NULL'; END IF;
    RAISE EXCEPTION 'rollback_sentinel';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'rollback_sentinel' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM deals) <> 7
     OR (SELECT won_at FROM deals WHERE id='40000000-0000-0000-0000-0000000000a1') IS NOT NULL
     OR (SELECT won_at FROM deals WHERE id='40000000-0000-0000-0000-0000000000a2') IS NOT NULL THEN
    RAISE EXCEPTION 'check drag: fixtures changed';
  END IF;
END $$;

-- meeting_won_by_type: org C's "Deal gewonnen" is an open stage; won lands on the added "Gewonnen" (stage_type won)
BEGIN;
INSERT INTO user_organizations (user_id, organization_id, is_default) VALUES ('00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000c', false);
INSERT INTO meeting_imports (id, org_id, meeting_date, transcript, status) VALUES
  ('50000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-00000000000c','2026-11-03','x','ready');
INSERT INTO meeting_proposals (id, org_id, import_id, position, kind, company_label, deal_id, payload, expected, quote) VALUES
  ('60000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-00000000000c','50000000-0000-0000-0000-0000000000c1',0,'won','Client',
   '40000000-0000-0000-0000-0000000000c1','{}','{"stage_id":"20000000-0000-0000-0000-0000000000c1"}','getekend'),
  ('60000000-0000-0000-0000-0000000000c2','10000000-0000-0000-0000-00000000000c','50000000-0000-0000-0000-0000000000c1',1,'lost','Client',
   '40000000-0000-0000-0000-0000000000c2','{"lost_reason":"te duur"}','{"stage_id":"20000000-0000-0000-0000-0000000000c3"}','afgehaakt');
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; d record; BEGIN
  r := apply_meeting_proposal('60000000-0000-0000-0000-0000000000c1', jsonb_build_object('deal_id','40000000-0000-0000-0000-0000000000c1','payload','{}'::jsonb));
  IF NOT coalesce((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'check meeting_won_by_type: apply failed: %', r; END IF;
  SELECT dl.stage_id, dl.won_at, dl.lost_at, s.name, s.stage_type INTO d
    FROM deals dl JOIN pipeline_stages s ON s.id = dl.stage_id WHERE dl.id = '40000000-0000-0000-0000-0000000000c1';
  IF d.stage_id = '20000000-0000-0000-0000-0000000000c3' OR d.name <> 'Gewonnen' OR d.stage_type <> 'won' THEN
    RAISE EXCEPTION 'check meeting_won_by_type: landed on % (%), expected Gewonnen', d.name, d.stage_type;
  END IF;
  IF d.won_at IS DISTINCT FROM now() OR d.lost_at IS NOT NULL THEN RAISE EXCEPTION 'check meeting_won_by_type: won_at/lost_at wrong'; END IF;
  IF NOT (r->'events' @> '[{"event":"deal.won"}]' AND r->'events' @> '[{"event":"deal.stage_changed","payload":{"to_stage":"Gewonnen"}}]')
     OR jsonb_array_length(r->'events') <> 2 THEN
    RAISE EXCEPTION 'check meeting_won_by_type: events %', r->'events';
  END IF;
  -- lost from a deal in the open-typed "Deal gewonnen" stage: no confirmation needed, lands on Verloren with reason
  r := apply_meeting_proposal('60000000-0000-0000-0000-0000000000c2', jsonb_build_object('deal_id','40000000-0000-0000-0000-0000000000c2','payload','{"lost_reason":"te duur"}'::jsonb));
  IF NOT coalesce((r->>'ok')::boolean, false) THEN RAISE EXCEPTION 'check meeting_lost_by_type: apply failed: %', r; END IF;
  SELECT dl.won_at, dl.lost_at, dl.lost_reason, s.name, s.stage_type INTO d
    FROM deals dl JOIN pipeline_stages s ON s.id = dl.stage_id WHERE dl.id = '40000000-0000-0000-0000-0000000000c2';
  IF d.name <> 'Verloren' OR d.stage_type <> 'lost' OR d.lost_at IS DISTINCT FROM now() OR d.won_at IS NOT NULL OR d.lost_reason <> 'te duur' THEN
    RAISE EXCEPTION 'check meeting_lost_by_type: deal %', row_to_json(d);
  END IF;
  IF NOT (r->'events' @> '[{"event":"deal.lost"}]') OR jsonb_array_length(r->'events') <> 2 THEN
    RAISE EXCEPTION 'check meeting_lost_by_type: events %', r->'events';
  END IF;
END $$;
ROLLBACK;
DO $$ BEGIN
  IF (SELECT stage_id FROM deals WHERE id='40000000-0000-0000-0000-0000000000c1') <> '20000000-0000-0000-0000-0000000000c1'
     OR EXISTS (SELECT 1 FROM meeting_proposals) THEN
    RAISE EXCEPTION 'check meeting_won_by_type: fixtures changed';
  END IF;
END $$;

-- org_admin
BEGIN;
DO $$ BEGIN
  IF NOT is_org_admin('00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000c') THEN
    RAISE EXCEPTION 'check org_admin: global admin must be org admin of C';
  END IF;
  IF is_org_admin('00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'check org_admin: plain member must not be org admin';
  END IF;
  UPDATE user_organizations SET role = 'admin'
    WHERE user_id='00000000-0000-0000-0000-0000000000a2' AND organization_id='10000000-0000-0000-0000-00000000000a';
  IF NOT is_org_admin('00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'check org_admin: role admin must make member org admin';
  END IF;
  IF is_org_admin('00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000c') THEN
    RAISE EXCEPTION 'check org_admin: org admin of L must not be org admin of C';
  END IF;
  -- owner (org creator, see useOrganization.tsx) counts as org admin of its own org only
  UPDATE user_organizations SET role = 'owner'
    WHERE user_id='00000000-0000-0000-0000-0000000000a2' AND organization_id='10000000-0000-0000-0000-00000000000a';
  IF NOT is_org_admin('00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'check org_admin: owner must be org admin of own org';
  END IF;
  IF is_org_admin('00000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000c') THEN
    RAISE EXCEPTION 'check org_admin: owner of L must not be org admin of C';
  END IF;
  UPDATE user_organizations SET role = 'admin'
    WHERE user_id='00000000-0000-0000-0000-0000000000a2' AND organization_id='10000000-0000-0000-0000-00000000000a';
END $$;
-- funnels RLS follows is_org_admin: client admin can create a funnel in own org only
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO funnels (org_id, name) VALUES ('10000000-0000-0000-0000-00000000000a', 'Client admin funnel');
  UPDATE funnels SET name = 'Hernoemd' WHERE org_id = '10000000-0000-0000-0000-00000000000a' AND name = 'Client admin funnel';
  IF NOT FOUND THEN RAISE EXCEPTION 'check org_admin_rls: org admin could not update funnel'; END IF;
  BEGIN
    INSERT INTO funnels (org_id, name) VALUES ('10000000-0000-0000-0000-00000000000c', 'Foreign funnel');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check org_admin_rls: org admin of L created a funnel in C'; END IF;
END $$;
ROLLBACK;
DO $$ BEGIN
  IF (SELECT role FROM user_organizations WHERE user_id='00000000-0000-0000-0000-0000000000a2'
        AND organization_id='10000000-0000-0000-0000-00000000000a') <> 'member'
     OR (SELECT count(*) FROM funnels) <> 2 THEN
    RAISE EXCEPTION 'check org_admin: fixtures changed';
  END IF;
END $$;

-- (later tasks append checks here)

DO $$ BEGIN RAISE NOTICE 'CRM FOUNDATION CHECKS PASSED'; END $$;
