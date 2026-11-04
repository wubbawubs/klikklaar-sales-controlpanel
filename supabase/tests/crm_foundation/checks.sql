-- Run after live schema + fixtures + new migrations. Every check raises on failure.
-- Login simulation helper for later checks:
--   SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true);
--   SET LOCAL ROLE authenticated;  (inside a transaction; RESET ROLE afterwards)

DO $$ BEGIN
  IF (SELECT count(*) FROM deals) <> 8 THEN RAISE EXCEPTION 'check fixtures: expected 8 deals'; END IF;
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
  IF (c->>'deals')::int <> 3 OR (c->>'deals_value_sum')::numeric <> 2000 OR (c->>'deals_won')::int <> 0 OR (c->>'deals_lost')::int <> 0
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
  IF (SELECT count(*) FROM crm_backup_20261104.deals) <> 8 THEN RAISE EXCEPTION 'check backup_exists: deals backup rows'; END IF;
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
  IF (SELECT count(*) FROM deals) <> 8 THEN RAISE EXCEPTION 'check stage_funnel_match: fixtures changed'; END IF;
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
  IF (SELECT count(*) FROM deals) <> 8
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

-- ===== Task 4: field storage, contacts on several deals =====
-- builtin_fields: every funnel has the 9 built-ins; only amount + billing_type enabled
DO $$ DECLARE v_f uuid; v_keys text; v_on text; BEGIN
  SELECT id INTO v_f FROM funnels WHERE org_id='10000000-0000-0000-0000-00000000000a';
  SELECT string_agg(key, ',' ORDER BY key) INTO v_keys FROM crm_fields
    WHERE funnel_id = v_f AND builtin AND entity = 'deal' AND org_id='10000000-0000-0000-0000-00000000000a';
  SELECT string_agg(key, ',' ORDER BY key) INTO v_on FROM crm_fields WHERE funnel_id = v_f AND builtin AND enabled;
  IF v_keys IS DISTINCT FROM 'amount,billing_type,category,country,description,lead_source,planned_start,priority,win_chance' THEN
    RAISE EXCEPTION 'check builtin_fields: org L funnel built-ins are %', v_keys;
  END IF;
  IF v_on IS DISTINCT FROM 'amount,billing_type' THEN RAISE EXCEPTION 'check builtin_fields: enabled built-ins are %', v_on; END IF;
  IF EXISTS (SELECT 1 FROM funnels f WHERE (SELECT count(*) FROM crm_fields c WHERE c.funnel_id = f.id AND c.builtin) <> 9) THEN
    RAISE EXCEPTION 'check builtin_fields: a funnel lacks its 9 built-ins';
  END IF;
  IF (SELECT label FROM crm_fields WHERE funnel_id = v_f AND key = 'amount') <> 'Bedrag'
     OR (SELECT type FROM crm_fields WHERE funnel_id = v_f AND key = 'amount') <> 'money' THEN
    RAISE EXCEPTION 'check builtin_fields: amount label/type';
  END IF;
END $$;

-- builtin_on_new_funnel + field constraints (rolled back)
DO $$ DECLARE v_f uuid; ok boolean; BEGIN
  BEGIN
    INSERT INTO funnels (org_id, name) VALUES ('10000000-0000-0000-0000-00000000000c', 'Tweede funnel') RETURNING id INTO v_f;
    IF (SELECT count(*) FROM crm_fields WHERE funnel_id = v_f AND builtin) <> 9 THEN RAISE EXCEPTION 'check builtin_on_new_funnel: no built-ins'; END IF;
    -- deal field needs a funnel; company field must not have one; same key twice in a funnel is rejected
    ok := false;
    BEGIN INSERT INTO crm_fields (org_id, entity, key, label, type) VALUES ('10000000-0000-0000-0000-00000000000c','deal','x','X','text');
    EXCEPTION WHEN check_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION 'check crm_fields: deal field without funnel accepted'; END IF;
    ok := false;
    BEGIN INSERT INTO crm_fields (org_id, entity, funnel_id, key, label, type) VALUES ('10000000-0000-0000-0000-00000000000c','company',v_f,'x','X','text');
    EXCEPTION WHEN check_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION 'check crm_fields: company field with funnel accepted'; END IF;
    INSERT INTO crm_fields (org_id, entity, key, label, type) VALUES ('10000000-0000-0000-0000-00000000000c','company','x','X','text');
    ok := false;
    BEGIN INSERT INTO crm_fields (org_id, entity, key, label, type) VALUES ('10000000-0000-0000-0000-00000000000c','company','x','X2','text');
    EXCEPTION WHEN unique_violation THEN ok := true; END;
    IF NOT ok THEN RAISE EXCEPTION 'check crm_fields: duplicate company key accepted'; END IF;
    -- a deal field's funnel must belong to the field's org
    ok := false;
    BEGIN INSERT INTO crm_fields (org_id, entity, funnel_id, key, label, type) VALUES ('10000000-0000-0000-0000-00000000000a','deal',v_f,'y','Y','text');
    EXCEPTION WHEN others THEN IF SQLERRM LIKE '%Funnel hoort niet bij deze organisatie%' THEN ok := true; ELSE RAISE; END IF; END;
    IF NOT ok THEN RAISE EXCEPTION 'check crm_fields: foreign funnel accepted'; END IF;
    RAISE EXCEPTION 'rollback_sentinel';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'rollback_sentinel' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM funnels) <> 2 THEN RAISE EXCEPTION 'check builtin_on_new_funnel: fixtures changed'; END IF;
END $$;

-- crm_fields RLS: member reads own org's fields, cannot write; org admin can
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ok boolean := false; BEGIN
  IF (SELECT count(*) FROM crm_fields) <> 9 OR EXISTS (SELECT 1 FROM crm_fields WHERE org_id <> '10000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'check crm_fields_rls: member must see only org L fields';
  END IF;
  BEGIN
    INSERT INTO crm_fields (org_id, entity, key, label, type) VALUES ('10000000-0000-0000-0000-00000000000a','company','m','M','text');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check crm_fields_rls: member could create a field'; END IF;
  UPDATE crm_fields SET enabled = true WHERE key = 'priority';
  IF FOUND THEN RAISE EXCEPTION 'check crm_fields_rls: member could update a field'; END IF;
END $$;
ROLLBACK;
BEGIN;
UPDATE user_organizations SET role = 'admin'
  WHERE user_id='00000000-0000-0000-0000-0000000000a2' AND organization_id='10000000-0000-0000-0000-00000000000a';
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ok boolean := false; BEGIN
  INSERT INTO crm_fields (org_id, entity, key, label, type, options)
    VALUES ('10000000-0000-0000-0000-00000000000a','contact','segment','Segment','choice','[{"id":"o1","label":"A","position":0,"archived":false}]');
  UPDATE crm_fields SET enabled = true WHERE key = 'priority';
  IF NOT FOUND THEN RAISE EXCEPTION 'check crm_fields_rls: org admin could not enable a built-in'; END IF;
  BEGIN
    UPDATE crm_fields SET key = 'prio2' WHERE key = 'priority';
  EXCEPTION WHEN others THEN IF SQLERRM LIKE '%Ingebouwd veld%' THEN ok := true; ELSE RAISE; END IF;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check crm_fields_rls: built-in key could be renamed'; END IF;
END $$;
ROLLBACK;

-- primary_contact: one primary deal_contacts row per deal with a contact_id
DO $$ BEGIN
  IF (SELECT count(*) FROM deal_contacts) <> (SELECT count(*) FROM deals d JOIN contacts c ON c.id = d.contact_id AND c.org_id = d.org_id)
     OR (SELECT count(*) FROM deal_contacts) <> 2
     OR EXISTS (SELECT 1 FROM deals d JOIN contacts c ON c.id = d.contact_id AND c.org_id = d.org_id WHERE NOT EXISTS (
                  SELECT 1 FROM deal_contacts dc WHERE dc.deal_id = d.id AND dc.contact_id = d.contact_id AND dc.is_primary AND dc.org_id = d.org_id)) THEN
    RAISE EXCEPTION 'check primary_contact: deal_contacts % vs deals with contact %',
      (SELECT count(*) FROM deal_contacts), (SELECT count(*) FROM deals WHERE contact_id IS NOT NULL);
  END IF;
END $$;

-- legacy_cross_org_contact: deal c3 (org C) points at org L's contact a1. The migration completed, skipped its
-- deal_contacts row and left deals.contact_id as it was; an unrelated update of that deal still works.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM deal_contacts WHERE deal_id = '40000000-0000-0000-0000-0000000000c3') THEN
    RAISE EXCEPTION 'check legacy_cross_org_contact: deal_contacts row created for cross-org link';
  END IF;
  IF (SELECT contact_id FROM deals WHERE id = '40000000-0000-0000-0000-0000000000c3') IS DISTINCT FROM '31000000-0000-0000-0000-0000000000a1'::uuid
     OR (SELECT contact_id FROM crm_backup_20261104.deals WHERE id = '40000000-0000-0000-0000-0000000000c3') IS DISTINCT FROM '31000000-0000-0000-0000-0000000000a1'::uuid THEN
    RAISE EXCEPTION 'check legacy_cross_org_contact: deals.contact_id changed';
  END IF;
  BEGIN
    UPDATE deals SET title = 'hernoemd' WHERE id = '40000000-0000-0000-0000-0000000000c3';
    RAISE EXCEPTION 'rollback_sentinel';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'rollback_sentinel' THEN RAISE; END IF;
  END;
END $$;

-- contact_sync: both directions, no recursion, one primary per deal (rolled back)
DO $$ DECLARE ok boolean; BEGIN
  BEGIN
    -- old screen: set contact on d2 -> primary row appears
    UPDATE deals SET contact_id = '31000000-0000-0000-0000-0000000000a1' WHERE id = '40000000-0000-0000-0000-0000000000a2';
    IF NOT EXISTS (SELECT 1 FROM deal_contacts WHERE deal_id='40000000-0000-0000-0000-0000000000a2'
                   AND contact_id='31000000-0000-0000-0000-0000000000a1' AND is_primary) THEN
      RAISE EXCEPTION 'check contact_sync: deals.contact_id did not create primary row';
    END IF;
    -- same contact on a second deal (contacts on several deals)
    IF (SELECT count(*) FROM deal_contacts WHERE contact_id='31000000-0000-0000-0000-0000000000a1') <> 2 THEN
      RAISE EXCEPTION 'check contact_sync: contact not on two deals';
    END IF;
    -- old screen: change contact -> new primary, old one kept as non-primary
    UPDATE deals SET contact_id = '31000000-0000-0000-0000-0000000000a3' WHERE id = '40000000-0000-0000-0000-0000000000a2';
    IF (SELECT contact_id FROM deal_contacts WHERE deal_id='40000000-0000-0000-0000-0000000000a2' AND is_primary) <> '31000000-0000-0000-0000-0000000000a3'
       OR (SELECT count(*) FROM deal_contacts WHERE deal_id='40000000-0000-0000-0000-0000000000a2') <> 2 THEN
      RAISE EXCEPTION 'check contact_sync: change of deals.contact_id not mirrored';
    END IF;
    -- new code: make a1 primary via deal_contacts -> deals.contact_id follows, a3 demoted
    UPDATE deal_contacts SET is_primary = true WHERE deal_id='40000000-0000-0000-0000-0000000000a2' AND contact_id='31000000-0000-0000-0000-0000000000a1';
    IF (SELECT contact_id FROM deals WHERE id='40000000-0000-0000-0000-0000000000a2') <> '31000000-0000-0000-0000-0000000000a1'
       OR (SELECT count(*) FROM deal_contacts WHERE deal_id='40000000-0000-0000-0000-0000000000a2' AND is_primary) <> 1 THEN
      RAISE EXCEPTION 'check contact_sync: is_primary not mirrored into deals.contact_id';
    END IF;
    -- new code: insert a new primary contact on d1 (org_id filled from the deal)
    INSERT INTO deal_contacts (deal_id, contact_id, role, is_primary) VALUES
      ('40000000-0000-0000-0000-0000000000a1','31000000-0000-0000-0000-0000000000a2','Beslisser', true);
    IF (SELECT contact_id FROM deals WHERE id='40000000-0000-0000-0000-0000000000a1') <> '31000000-0000-0000-0000-0000000000a2'
       OR (SELECT count(*) FROM deal_contacts WHERE deal_id='40000000-0000-0000-0000-0000000000a1' AND is_primary) <> 1 THEN
      RAISE EXCEPTION 'check contact_sync: inserted primary not mirrored';
    END IF;
    -- deleting the primary row clears deals.contact_id
    DELETE FROM deal_contacts WHERE deal_id='40000000-0000-0000-0000-0000000000a1' AND is_primary;
    IF (SELECT contact_id FROM deals WHERE id='40000000-0000-0000-0000-0000000000a1') IS NOT NULL THEN
      RAISE EXCEPTION 'check contact_sync: deleting primary did not clear deals.contact_id';
    END IF;
    -- old screen clears contact -> primary demoted, link kept
    UPDATE deals SET contact_id = NULL WHERE id = '40000000-0000-0000-0000-0000000000a2';
    IF EXISTS (SELECT 1 FROM deal_contacts WHERE deal_id='40000000-0000-0000-0000-0000000000a2' AND is_primary)
       OR (SELECT count(*) FROM deal_contacts WHERE deal_id='40000000-0000-0000-0000-0000000000a2') <> 2 THEN
      RAISE EXCEPTION 'check contact_sync: clearing deals.contact_id not mirrored';
    END IF;
    -- new deal with contact gets its primary row
    INSERT INTO deals (org_id, contact_id, title) VALUES ('10000000-0000-0000-0000-00000000000a','31000000-0000-0000-0000-0000000000a3','met contact');
    IF NOT EXISTS (SELECT 1 FROM deal_contacts dc JOIN deals d ON d.id = dc.deal_id WHERE d.title='met contact' AND dc.is_primary
                   AND dc.contact_id='31000000-0000-0000-0000-0000000000a3') THEN
      RAISE EXCEPTION 'check contact_sync: new deal has no primary row';
    END IF;
    -- org mismatch: org C deal + org L contact, or explicit wrong org_id
    ok := false;
    BEGIN INSERT INTO deal_contacts (deal_id, contact_id) VALUES ('40000000-0000-0000-0000-0000000000c1','31000000-0000-0000-0000-0000000000a1');
    EXCEPTION WHEN others THEN IF SQLERRM LIKE '%hoort niet bij de organisatie van de deal%' THEN ok := true; ELSE RAISE; END IF; END;
    IF NOT ok THEN RAISE EXCEPTION 'check deal_contacts_org: cross-org contact accepted'; END IF;
    ok := false;
    BEGIN INSERT INTO deal_contacts (deal_id, contact_id, org_id) VALUES
      ('40000000-0000-0000-0000-0000000000a1','31000000-0000-0000-0000-0000000000a3','10000000-0000-0000-0000-00000000000c');
    EXCEPTION WHEN others THEN IF SQLERRM LIKE '%hoort niet bij de organisatie van de deal%' THEN ok := true; ELSE RAISE; END IF; END;
    IF NOT ok THEN RAISE EXCEPTION 'check deal_contacts_org: wrong org_id accepted'; END IF;
    RAISE EXCEPTION 'rollback_sentinel';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'rollback_sentinel' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM deal_contacts) <> 2 OR (SELECT count(*) FROM deals) <> 8
     OR (SELECT contact_id FROM deals WHERE id='40000000-0000-0000-0000-0000000000a1') <> '31000000-0000-0000-0000-0000000000a1' THEN
    RAISE EXCEPTION 'check contact_sync: fixtures changed';
  END IF;
END $$;

-- deal_contacts RLS: member sees/writes own org only
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM deal_contacts) <> 2 THEN RAISE EXCEPTION 'check deal_contacts_rls: member sees % rows', (SELECT count(*) FROM deal_contacts); END IF;
  INSERT INTO deal_contacts (deal_id, contact_id, role) VALUES ('40000000-0000-0000-0000-0000000000a1','31000000-0000-0000-0000-0000000000a3','Gebruiker');
  IF (SELECT contact_id FROM deals WHERE id='40000000-0000-0000-0000-0000000000a1') <> '31000000-0000-0000-0000-0000000000a1' THEN
    RAISE EXCEPTION 'check deal_contacts_rls: non-primary insert changed deals.contact_id';
  END IF;
END $$;
ROLLBACK;

-- range_check + win_chance bounds
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    INSERT INTO deals (org_id, title, value_min_eur, value_max_eur) VALUES ('10000000-0000-0000-0000-00000000000a','range',10,5);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check range_check: min > max accepted'; END IF;
  ok := false;
  BEGIN
    INSERT INTO deals (org_id, title, win_chance) VALUES ('10000000-0000-0000-0000-00000000000a','kans',101);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check range_check: win_chance 101 accepted'; END IF;
  IF (SELECT count(*) FROM deals) <> 8 THEN RAISE EXCEPTION 'check range_check: fixtures changed'; END IF;
END $$;

-- counts_unchanged_2: integrity counts still the fixture totals (the migration itself asserts before = after);
-- existing deal/contact/company rows untouched (contact_id, updated_at vs. backup)
DO $$ BEGIN
  -- keys added by later migrations (crm_tasks) are ignored here; they have their own checks
  IF (crm_integrity_counts('10000000-0000-0000-0000-00000000000a') - 'crm_tasks') <> '{"deals":5,"deals_value_sum":11500,"deals_won":0,"deals_lost":1,
       "companies":2,"contacts":3,"deal_activities":4,"crm_appointments":2,"deal_fees":2,"deal_fees_sum":450,"company_items":1,"stages":4}'::jsonb
     OR (crm_integrity_counts('10000000-0000-0000-0000-00000000000c') - 'stages' - 'crm_tasks') <> '{"deals":3,"deals_value_sum":2000,"deals_won":0,"deals_lost":0,
       "companies":0,"contacts":0,"deal_activities":0,"crm_appointments":0,"deal_fees":0,"deal_fees_sum":0,"company_items":0}'::jsonb THEN
    RAISE EXCEPTION 'check counts_unchanged_2: % / %', crm_integrity_counts('10000000-0000-0000-0000-00000000000a'),
      crm_integrity_counts('10000000-0000-0000-0000-00000000000c');
  END IF;
  IF EXISTS (SELECT 1 FROM crm_backup_20261104.deals b JOIN deals d USING (id)
             WHERE (b.contact_id, b.value_eur, b.updated_at) IS DISTINCT FROM (d.contact_id, d.value_eur, d.updated_at))
     OR EXISTS (SELECT 1 FROM crm_backup_20261104.contacts b JOIN contacts c USING (id) WHERE b.updated_at IS DISTINCT FROM c.updated_at)
     OR EXISTS (SELECT 1 FROM crm_backup_20261104.companies b JOIN companies c USING (id) WHERE b.updated_at IS DISTINCT FROM c.updated_at) THEN
    RAISE EXCEPTION 'check counts_unchanged_2: existing rows changed';
  END IF;
  IF EXISTS (SELECT 1 FROM deals WHERE custom <> '{}' OR value_min_eur IS NOT NULL OR win_chance IS NOT NULL)
     OR EXISTS (SELECT 1 FROM contacts WHERE custom <> '{}') OR EXISTS (SELECT 1 FROM companies WHERE custom <> '{}') THEN
    RAISE EXCEPTION 'check counts_unchanged_2: new columns not at their defaults';
  END IF;
END $$;

-- ===== Task 5: change history =====
-- history_update: a member's title change writes exactly one compact row with the member as actor
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
UPDATE deals SET title = 'Website Jansen v2' WHERE id = '40000000-0000-0000-0000-0000000000a1';
DO $$ DECLARE r record; BEGIN
  IF to_regclass('public.crm_history') IS NULL THEN RAISE EXCEPTION 'check history_update: crm_history missing'; END IF;
  IF (SELECT count(*) FROM crm_history WHERE record_id = '40000000-0000-0000-0000-0000000000a1') <> 1 THEN
    RAISE EXCEPTION 'check history_update: expected 1 row, got %', (SELECT count(*) FROM crm_history WHERE record_id = '40000000-0000-0000-0000-0000000000a1');
  END IF;
  SELECT * INTO r FROM crm_history WHERE record_id = '40000000-0000-0000-0000-0000000000a1';
  IF NOT FOUND THEN RAISE EXCEPTION 'check history_update: no row captured'; END IF;
  IF r.entity IS DISTINCT FROM 'deals' OR r.action IS DISTINCT FROM 'update' OR r.org_id IS DISTINCT FROM '10000000-0000-0000-0000-00000000000a'::uuid
     OR r.changes IS DISTINCT FROM '{"title": {"from": "Website Jansen", "to": "Website Jansen v2"}}'::jsonb
     OR r.actor IS DISTINCT FROM '00000000-0000-0000-0000-0000000000a2'::uuid OR r.at IS NULL THEN
    RAISE EXCEPTION 'check history_update: wrong row %', to_jsonb(r);
  END IF;
END $$;
ROLLBACK;

-- history_noop: touching only updated_at (or stage_updated_at) writes nothing
BEGIN;
UPDATE deals SET updated_at = now() - interval '1 day' WHERE id = '40000000-0000-0000-0000-0000000000a1';
UPDATE deals SET stage_updated_at = now() - interval '1 day' WHERE id = '40000000-0000-0000-0000-0000000000a1';
UPDATE companies SET name = name WHERE id = '30000000-0000-0000-0000-0000000000a1';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM crm_history) THEN RAISE EXCEPTION 'check history_noop: % rows written', (SELECT count(*) FROM crm_history); END IF;
END $$;
ROLLBACK;

-- history_readonly: members cannot write, delete or truncate history
BEGIN;
UPDATE deals SET title = 'iets' WHERE id = '40000000-0000-0000-0000-0000000000a1';   -- one org L row to attack
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ok boolean := false; n int; BEGIN
  IF (SELECT count(*) FROM crm_history) <> 1 THEN RAISE EXCEPTION 'check history_readonly: member does not see own org row'; END IF;
  BEGIN
    INSERT INTO crm_history (org_id, entity, record_id, action, changes)
    VALUES ('10000000-0000-0000-0000-00000000000a','deals','40000000-0000-0000-0000-0000000000a1','update','{}');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;   -- no grant (42501) or RLS rejection (also 42501)
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check history_readonly: member INSERT accepted'; END IF;
  n := 0;
  BEGIN DELETE FROM crm_history; GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN n := 0;
  END;
  IF n <> 0 THEN RAISE EXCEPTION 'check history_readonly: member DELETE removed % rows', n; END IF;
  n := 0;
  BEGIN UPDATE crm_history SET changes = '{}'; GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN n := 0;
  END;
  IF n <> 0 THEN RAISE EXCEPTION 'check history_readonly: member UPDATE changed % rows', n; END IF;
  ok := false;
  BEGIN TRUNCATE crm_history; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'check history_readonly: member TRUNCATE accepted'; END IF;
  IF (SELECT count(*) FROM crm_history) <> 1 OR (SELECT changes FROM crm_history) = '{}'::jsonb THEN
    RAISE EXCEPTION 'check history_readonly: history row altered';
  END IF;
END $$;
ROLLBACK;

-- history_rls: a member of org L sees no history of org C
BEGIN;
UPDATE deals SET title = 'Client lead v2' WHERE id = '40000000-0000-0000-0000-0000000000c1';
DO $$ BEGIN
  IF (SELECT count(*) FROM crm_history WHERE org_id = '10000000-0000-0000-0000-00000000000c') <> 1 THEN
    RAISE EXCEPTION 'check history_rls: org C row not written';
  END IF;
  IF EXISTS (SELECT 1 FROM crm_history WHERE org_id = '10000000-0000-0000-0000-00000000000c' AND actor IS NOT NULL) THEN
    RAISE EXCEPTION 'check history_rls: actor must be null without a logged-in user';
  END IF;
END $$;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM crm_history) THEN RAISE EXCEPTION 'check history_rls: member sees org C history'; END IF;
END $$;
ROLLBACK;

-- history_capture: insert/delete keep the full row, related tables are captured, deal_fees churn is recorded,
-- deal_contacts rows hang under their deal (rolled back)
DO $$ DECLARE v_id uuid; v_fee uuid; r record; BEGIN
  BEGIN
    INSERT INTO companies (org_id, name) VALUES ('10000000-0000-0000-0000-00000000000a','Nieuw BV') RETURNING id INTO v_id;
    SELECT * INTO r FROM crm_history WHERE entity = 'companies' AND record_id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'check history_capture: insert not captured'; END IF;
    IF r.action IS DISTINCT FROM 'insert' OR r.changes->>'name' IS DISTINCT FROM 'Nieuw BV'
       OR r.changes->>'org_id' IS DISTINCT FROM '10000000-0000-0000-0000-00000000000a'
       OR NOT coalesce(r.changes ? 'updated_at', false) THEN
      RAISE EXCEPTION 'check history_capture: insert row %', to_jsonb(r);
    END IF;
    -- a hard delete (since the trash migration only possible during a purge) keeps the full row
    PERFORM set_config('crm.purge', 'on', true);
    DELETE FROM companies WHERE id = v_id;
    PERFORM set_config('crm.purge', 'off', true);
    IF EXISTS (SELECT 1 FROM companies WHERE id = v_id) THEN RAISE EXCEPTION 'check history_capture: purge delete kept the row'; END IF;
    SELECT * INTO r FROM crm_history WHERE entity = 'companies' AND record_id = v_id AND action = 'delete';
    IF NOT FOUND THEN RAISE EXCEPTION 'check history_capture: delete not captured'; END IF;
    IF r.changes->>'name' IS DISTINCT FROM 'Nieuw BV' THEN RAISE EXCEPTION 'check history_capture: delete row %', to_jsonb(r); END IF;
    -- app save path: delete + re-insert fees
    SELECT id INTO v_fee FROM deal_fees WHERE label = 'Opstart';
    IF NOT FOUND THEN RAISE EXCEPTION 'check history_capture: fixture fee missing'; END IF;
    DELETE FROM deal_fees WHERE deal_id = '40000000-0000-0000-0000-0000000000a5';
    INSERT INTO deal_fees (deal_id, org_id, amount, kind, interval, label, position) VALUES
      ('40000000-0000-0000-0000-0000000000a5','10000000-0000-0000-0000-00000000000a',150,'one_time',NULL,'Opstart',0);
    IF (SELECT count(*) FROM crm_history WHERE entity = 'deal_fees' AND action = 'delete') <> 2
       OR coalesce((SELECT changes->>'amount' FROM crm_history WHERE entity = 'deal_fees' AND record_id = v_fee), '') NOT IN ('100.00','100')
       OR (SELECT count(*) FROM crm_history WHERE entity = 'deal_fees' AND action = 'insert'
           AND changes->>'deal_id' = '40000000-0000-0000-0000-0000000000a5') <> 1 THEN
      RAISE EXCEPTION 'check history_capture: deal_fees churn not recorded';
    END IF;
    -- deal_contacts: record_id is the deal, contact_id always present
    INSERT INTO deal_contacts (deal_id, contact_id, role) VALUES ('40000000-0000-0000-0000-0000000000a1','31000000-0000-0000-0000-0000000000a3','Gebruiker');
    UPDATE deal_contacts SET role = 'Beslisser' WHERE deal_id = '40000000-0000-0000-0000-0000000000a1' AND contact_id = '31000000-0000-0000-0000-0000000000a3';
    SELECT * INTO r FROM crm_history WHERE entity = 'deal_contacts' AND action = 'update';
    IF NOT FOUND THEN RAISE EXCEPTION 'check history_capture: deal_contacts update not captured'; END IF;
    IF r.record_id IS DISTINCT FROM '40000000-0000-0000-0000-0000000000a1'::uuid
       OR r.changes IS DISTINCT FROM '{"role": {"from": "Gebruiker", "to": "Beslisser"}, "contact_id": {"from": "31000000-0000-0000-0000-0000000000a3", "to": "31000000-0000-0000-0000-0000000000a3"}}'::jsonb THEN
      RAISE EXCEPTION 'check history_capture: deal_contacts update %', to_jsonb(r);
    END IF;
    -- every listed table carries the trigger
    IF (SELECT count(DISTINCT c.relname) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_proc p ON p.oid = t.tgfoid WHERE p.proname = 'crm_history_capture' AND NOT t.tgisinternal
          AND c.relname IN ('deals','companies','contacts','deal_activities','crm_appointments','deal_fees','deal_contacts',
                            'pipeline_stages','funnels','crm_fields','company_items')) <> 11 THEN
      RAISE EXCEPTION 'check history_capture: not all 11 tables have the history trigger';
    END IF;
    RAISE EXCEPTION 'rollback_sentinel';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'rollback_sentinel' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM crm_history) OR (SELECT count(*) FROM deal_fees) <> 2 THEN
    RAISE EXCEPTION 'check history_capture: fixtures changed';
  END IF;
END $$;

-- history_soft_delete: deleted_at null->set is 'delete', set->null is 'restore' (generic; probed on a temp table)
DO $$ DECLARE v_id uuid := gen_random_uuid(); BEGIN
  BEGIN
    CREATE TABLE public._hist_probe (id uuid PRIMARY KEY, org_id uuid NOT NULL, name text, deleted_at timestamptz);
    CREATE TRIGGER crm_history AFTER INSERT OR UPDATE OR DELETE ON public._hist_probe
      FOR EACH ROW EXECUTE FUNCTION public.crm_history_capture();
    INSERT INTO public._hist_probe VALUES (v_id, '10000000-0000-0000-0000-00000000000a', 'x', NULL);
    UPDATE public._hist_probe SET deleted_at = now() WHERE id = v_id;
    UPDATE public._hist_probe SET deleted_at = NULL WHERE id = v_id;
    UPDATE public._hist_probe SET name = 'y' WHERE id = v_id;
    IF (SELECT string_agg(action, ',' ORDER BY id) FROM crm_history WHERE record_id = v_id) IS DISTINCT FROM 'insert,delete,restore,update' THEN
      RAISE EXCEPTION 'check history_soft_delete: got %', (SELECT string_agg(action, ',' ORDER BY id) FROM crm_history WHERE record_id = v_id);
    END IF;
    RAISE EXCEPTION 'rollback_sentinel';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'rollback_sentinel' THEN RAISE; END IF;
  END;
  IF to_regclass('public._hist_probe') IS NOT NULL OR EXISTS (SELECT 1 FROM crm_history) THEN
    RAISE EXCEPTION 'check history_soft_delete: probe not rolled back';
  END IF;
END $$;

-- ===== Task 6: trash (soft delete, batch restore, admin purge) =====
-- Ids: deal a1 = 40..a1 (2 activities, 1 appointment), company Bakkerij Jansen = 30..a1 (deals a1+a2, contact 31..a1,
-- 1 company_item, appointment of a1), member u_member = 00..a2, super admin u_admin = 00..a1.

-- delete_is_soft / hidden_from_select / deal batch restore (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1';
RESET ROLE;
DO $$ DECLARE d record; r record; BEGIN
  SELECT * INTO d FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1';
  IF NOT FOUND THEN RAISE EXCEPTION 'check delete_is_soft: deal row is gone (hard delete)'; END IF;
  IF d.deleted_at IS NULL OR d.delete_batch IS NULL OR d.deleted_by IS DISTINCT FROM '00000000-0000-0000-0000-0000000000a2'::uuid THEN
    RAISE EXCEPTION 'check delete_is_soft: deleted_at/by/batch not set: %', to_jsonb(d);
  END IF;
  IF (SELECT count(*) FROM deal_activities WHERE deal_id = d.id AND delete_batch = d.delete_batch AND deleted_at IS NOT NULL) IS DISTINCT FROM 2::bigint
     OR (SELECT count(*) FROM crm_appointments WHERE deal_id = d.id AND delete_batch = d.delete_batch AND deleted_at IS NOT NULL) IS DISTINCT FROM 1::bigint THEN
    RAISE EXCEPTION 'check delete_is_soft: activities/appointments not in the deal''s batch';
  END IF;
  IF (SELECT count(*) FROM deal_fees) IS DISTINCT FROM 2::bigint
     OR (SELECT count(*) FROM deals WHERE deleted_at IS NOT NULL) IS DISTINCT FROM 1::bigint
     OR (SELECT count(*) FROM companies WHERE deleted_at IS NOT NULL) IS DISTINCT FROM 0::bigint THEN
    RAISE EXCEPTION 'check delete_is_soft: other rows touched';
  END IF;
  SELECT * INTO r FROM crm_history WHERE entity = 'deals' AND record_id = d.id AND action = 'delete';
  IF NOT FOUND THEN RAISE EXCEPTION 'check delete_is_soft: no delete history row'; END IF;
  IF NOT coalesce(r.changes ? 'deleted_at', false) OR r.actor IS DISTINCT FROM '00000000-0000-0000-0000-0000000000a2'::uuid THEN
    RAISE EXCEPTION 'check delete_is_soft: history row %', to_jsonb(r);
  END IF;
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_class c ON c.oid = t.tgrelid
      WHERE p.proname = 'crm_soft_delete' AND NOT t.tgisinternal
        AND c.relname IN ('deals','companies','contacts','deal_activities','crm_appointments','company_items')) IS DISTINCT FROM 6::bigint
     OR EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_class c ON c.oid = t.tgrelid
      WHERE p.proname = 'crm_soft_delete' AND c.relname IN ('deal_fees','deal_contacts')) THEN
    RAISE EXCEPTION 'check delete_is_soft: soft-delete trigger not on exactly the six tables';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ok boolean := false; n int; r record; BEGIN
  IF EXISTS (SELECT 1 FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1')
     OR (SELECT count(*) FROM deals) IS DISTINCT FROM 4::bigint
     OR EXISTS (SELECT 1 FROM deal_activities WHERE deal_id = '40000000-0000-0000-0000-0000000000a1')
     OR EXISTS (SELECT 1 FROM crm_appointments WHERE deal_id = '40000000-0000-0000-0000-0000000000a1') THEN
    RAISE EXCEPTION 'check hidden_from_select: trashed deal or its children still visible';
  END IF;
  UPDATE deals SET title = 'x' WHERE id = '40000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'check hidden_from_select: member updated a trashed deal'; END IF;
  BEGIN
    UPDATE deals SET deleted_at = now() WHERE id = '40000000-0000-0000-0000-0000000000a3';
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check hidden_from_select: member could trash a deal by UPDATE (no batch)'; END IF;
  -- trash list: one batch head (the deal), batch of 4
  IF (SELECT count(*) FROM crm_trash_list('10000000-0000-0000-0000-00000000000a')) IS DISTINCT FROM 1::bigint THEN
    RAISE EXCEPTION 'check trash_list: expected 1 head, got %', (SELECT count(*) FROM crm_trash_list('10000000-0000-0000-0000-00000000000a'));
  END IF;
  SELECT * INTO r FROM crm_trash_list('10000000-0000-0000-0000-00000000000a');
  IF NOT FOUND THEN RAISE EXCEPTION 'check trash_list: empty'; END IF;
  IF r.entity IS DISTINCT FROM 'deals' OR r.record_id IS DISTINCT FROM '40000000-0000-0000-0000-0000000000a1'::uuid
     OR r.label IS DISTINCT FROM 'Website Jansen' OR r.batch_size IS DISTINCT FROM 4
     OR r.deleted_by IS DISTINCT FROM '00000000-0000-0000-0000-0000000000a2'::uuid OR r.deleted_at IS NULL THEN
    RAISE EXCEPTION 'check trash_list: row %', to_jsonb(r);
  END IF;
  n := crm_restore(r.delete_batch);
  IF n IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'check deal_restore: restored % rows, expected 4', n; END IF;
  n := crm_restore(r.delete_batch);
  IF n IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'check deal_restore: second restore returned %', n; END IF;
  IF (SELECT count(*) FROM deals) IS DISTINCT FROM 5::bigint OR (SELECT count(*) FROM deal_activities) IS DISTINCT FROM 4::bigint
     OR (SELECT count(*) FROM crm_appointments) IS DISTINCT FROM 2::bigint
     OR EXISTS (SELECT 1 FROM crm_trash_list('10000000-0000-0000-0000-00000000000a')) THEN
    RAISE EXCEPTION 'check deal_restore: not everything back';
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT string_agg(action, ',' ORDER BY id) FROM crm_history WHERE entity = 'deals' AND record_id = '40000000-0000-0000-0000-0000000000a1')
     IS DISTINCT FROM 'delete,restore' THEN
    RAISE EXCEPTION 'check deal_restore: history %', (SELECT string_agg(action, ',' ORDER BY id) FROM crm_history
      WHERE entity = 'deals' AND record_id = '40000000-0000-0000-0000-0000000000a1');
  END IF;
  IF EXISTS (SELECT 1 FROM deals WHERE deleted_at IS NOT NULL OR delete_batch IS NOT NULL OR deleted_by IS NOT NULL)
     OR EXISTS (SELECT 1 FROM deal_activities WHERE deleted_at IS NOT NULL OR delete_batch IS NOT NULL)
     OR EXISTS (SELECT 1 FROM crm_appointments WHERE deleted_at IS NOT NULL OR delete_batch IS NOT NULL) THEN
    RAISE EXCEPTION 'check deal_restore: trash columns not cleared';
  END IF;
END $$;
ROLLBACK;

-- company_batch: a company takes its deals (+ children), contacts, items and appointments into one batch;
-- an activity trashed earlier keeps its own batch and is not restored with the company (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DELETE FROM deal_activities WHERE body = 'Gebeld';
DELETE FROM companies WHERE id = '30000000-0000-0000-0000-0000000000a1';
RESET ROLE;
DO $$ DECLARE v_b uuid; BEGIN
  SELECT delete_batch INTO v_b FROM companies WHERE id = '30000000-0000-0000-0000-0000000000a1' AND deleted_at IS NOT NULL;
  IF NOT FOUND OR v_b IS NULL THEN RAISE EXCEPTION 'check company_batch: company not soft-deleted'; END IF;
  IF (SELECT count(*) FROM deals WHERE delete_batch = v_b) IS DISTINCT FROM 2::bigint
     OR (SELECT count(*) FROM deal_activities WHERE delete_batch = v_b) IS DISTINCT FROM 2::bigint
     OR (SELECT count(*) FROM crm_appointments WHERE delete_batch = v_b) IS DISTINCT FROM 1::bigint
     OR (SELECT count(*) FROM contacts WHERE delete_batch = v_b) IS DISTINCT FROM 1::bigint
     OR (SELECT count(*) FROM company_items WHERE delete_batch = v_b) IS DISTINCT FROM 1::bigint THEN
    RAISE EXCEPTION 'check company_batch: batch incomplete';
  END IF;
  IF (SELECT delete_batch FROM deal_activities WHERE body = 'Gebeld') IS NULL
     OR (SELECT delete_batch FROM deal_activities WHERE body = 'Gebeld') = v_b THEN
    RAISE EXCEPTION 'check company_batch: earlier trashed activity was re-batched';
  END IF;
  IF EXISTS (SELECT 1 FROM contacts WHERE id = '31000000-0000-0000-0000-0000000000a3' AND deleted_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM companies WHERE id = '30000000-0000-0000-0000-0000000000a2' AND deleted_at IS NOT NULL)
     OR (SELECT count(*) FROM deals WHERE deleted_at IS NOT NULL) IS DISTINCT FROM 2::bigint THEN
    RAISE EXCEPTION 'check company_batch: rows outside the company trashed';
  END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r record; v_act uuid; n int; BEGIN
  IF (SELECT count(*) FROM deals) IS DISTINCT FROM 3::bigint OR (SELECT count(*) FROM contacts) IS DISTINCT FROM 2::bigint
     OR EXISTS (SELECT 1 FROM company_items) OR (SELECT count(*) FROM companies) IS DISTINCT FROM 1::bigint THEN
    RAISE EXCEPTION 'check company_batch: trashed rows still visible';
  END IF;
  IF (SELECT string_agg(entity || ':' || label || ':' || batch_size, ',' ORDER BY entity)
      FROM crm_trash_list('10000000-0000-0000-0000-00000000000a')) IS DISTINCT FROM 'companies:Bakkerij Jansen:8,deal_activities:Gebeld:1' THEN
    RAISE EXCEPTION 'check company_batch: trash list %', (SELECT string_agg(entity || ':' || label || ':' || batch_size, ',' ORDER BY entity)
      FROM crm_trash_list('10000000-0000-0000-0000-00000000000a'));
  END IF;
  SELECT * INTO r FROM crm_trash_list('10000000-0000-0000-0000-00000000000a') WHERE entity = 'companies';
  IF NOT FOUND THEN RAISE EXCEPTION 'check company_batch: company head missing'; END IF;
  SELECT delete_batch INTO v_act FROM crm_trash_list('10000000-0000-0000-0000-00000000000a') WHERE entity = 'deal_activities';
  IF NOT FOUND THEN RAISE EXCEPTION 'check company_batch: activity head missing'; END IF;
  n := crm_restore(r.delete_batch);
  IF n IS DISTINCT FROM 8 THEN RAISE EXCEPTION 'check company_batch: restore returned %, expected 8', n; END IF;
  IF (SELECT count(*) FROM deals) IS DISTINCT FROM 5::bigint OR (SELECT count(*) FROM contacts) IS DISTINCT FROM 3::bigint
     OR (SELECT count(*) FROM company_items) IS DISTINCT FROM 1::bigint OR (SELECT count(*) FROM companies) IS DISTINCT FROM 2::bigint
     OR (SELECT count(*) FROM crm_appointments) IS DISTINCT FROM 2::bigint OR (SELECT count(*) FROM deal_activities) IS DISTINCT FROM 3::bigint THEN
    RAISE EXCEPTION 'check company_batch: not everything back after restore';
  END IF;
  IF crm_restore(r.delete_batch) IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'check company_batch: restore not idempotent'; END IF;
  n := crm_restore(v_act);   -- separate statement: a query sees the restore's changes only in the next statement
  IF n IS DISTINCT FROM 1 OR (SELECT count(*) FROM deal_activities) IS DISTINCT FROM 4::bigint THEN
    RAISE EXCEPTION 'check company_batch: separate activity batch restore failed';
  END IF;
END $$;
ROLLBACK;

-- counts_after_soft_delete: crm_integrity_counts counts trashed rows too (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('crm.test_counts', crm_integrity_counts('10000000-0000-0000-0000-00000000000a')::text, true); END $$;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DELETE FROM companies WHERE id = '30000000-0000-0000-0000-0000000000a1';
DELETE FROM contacts WHERE id = '31000000-0000-0000-0000-0000000000a3';
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM companies WHERE deleted_at IS NOT NULL) IS DISTINCT FROM 1::bigint THEN
    RAISE EXCEPTION 'check counts_after_soft_delete: nothing was soft-deleted';
  END IF;
  IF crm_integrity_counts('10000000-0000-0000-0000-00000000000a') IS DISTINCT FROM current_setting('crm.test_counts')::jsonb THEN
    RAISE EXCEPTION 'check counts_after_soft_delete: % vs %', crm_integrity_counts('10000000-0000-0000-0000-00000000000a'), current_setting('crm.test_counts');
  END IF;
END $$;
ROLLBACK;

-- purge_admin_only: a member cannot purge; the admin's purge removes the whole batch and scrubs its history (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
UPDATE companies SET name = 'Bakkerij Jansen BV' WHERE id = '30000000-0000-0000-0000-0000000000a1';   -- older history with personal data
-- the purged contact also hangs on a deal outside the batch, with a free-text role (insert + update history)
INSERT INTO deal_contacts (deal_id, contact_id, role) VALUES ('40000000-0000-0000-0000-0000000000a5','31000000-0000-0000-0000-0000000000a1','Rol Geheim');
UPDATE deal_contacts SET role = 'Rol Geheimer' WHERE deal_id = '40000000-0000-0000-0000-0000000000a5' AND contact_id = '31000000-0000-0000-0000-0000000000a1';
DELETE FROM companies WHERE id = '30000000-0000-0000-0000-0000000000a1';
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN PERFORM crm_purge('companies', '30000000-0000-0000-0000-0000000000a1'); EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'check purge_admin_only: member could purge'; END IF;
  ok := false;
  BEGIN PERFORM crm_trash_list('10000000-0000-0000-0000-00000000000c'); EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'check purge_admin_only: member listed another org''s trash'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE ok boolean := false; v_res jsonb; BEGIN
  BEGIN PERFORM crm_purge('pipeline_stages', '20000000-0000-0000-0000-0000000000a1'); EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'check purge_admin_only: unknown entity accepted'; END IF;
  ok := false;
  BEGIN PERFORM crm_purge('deals', '40000000-0000-0000-0000-0000000000a3'); EXCEPTION WHEN others THEN ok := true; END;
  IF NOT ok THEN RAISE EXCEPTION 'check purge_admin_only: purged a record that is not in the trash'; END IF;
  v_res := crm_purge('companies', '30000000-0000-0000-0000-0000000000a1');
  IF v_res IS DISTINCT FROM '{"rows": 9, "files": []}'::jsonb THEN
    RAISE EXCEPTION 'check purge_admin_only: purge returned %, expected 9 rows and no files', v_res;
  END IF;
END $$;
RESET ROLE;
DO $$ DECLARE r record; BEGIN
  IF EXISTS (SELECT 1 FROM companies WHERE id = '30000000-0000-0000-0000-0000000000a1')
     OR EXISTS (SELECT 1 FROM deals WHERE id IN ('40000000-0000-0000-0000-0000000000a1','40000000-0000-0000-0000-0000000000a2'))
     OR EXISTS (SELECT 1 FROM deal_activities WHERE deal_id IN ('40000000-0000-0000-0000-0000000000a1','40000000-0000-0000-0000-0000000000a2'))
     OR EXISTS (SELECT 1 FROM crm_appointments WHERE deal_id = '40000000-0000-0000-0000-0000000000a1')
     OR EXISTS (SELECT 1 FROM contacts WHERE id = '31000000-0000-0000-0000-0000000000a1')
     OR EXISTS (SELECT 1 FROM company_items) THEN
    RAISE EXCEPTION 'check purge_admin_only: purged rows still exist';
  END IF;
  IF (SELECT count(*) FROM deals) IS DISTINCT FROM 6::bigint OR (SELECT count(*) FROM companies) IS DISTINCT FROM 1::bigint
     OR (SELECT count(*) FROM deal_fees) IS DISTINCT FROM 2::bigint OR (SELECT count(*) FROM contacts) IS DISTINCT FROM 2::bigint THEN
    RAISE EXCEPTION 'check purge_admin_only: rows outside the batch removed';
  END IF;
  IF (SELECT count(*) FROM crm_history WHERE action = 'purge') IS DISTINCT FROM 1::bigint THEN
    RAISE EXCEPTION 'check purge_admin_only: expected exactly one purge row';
  END IF;
  SELECT * INTO r FROM crm_history WHERE action = 'purge';
  IF NOT FOUND THEN RAISE EXCEPTION 'check purge_admin_only: purge row missing'; END IF;
  IF r.entity IS DISTINCT FROM 'companies' OR r.record_id IS DISTINCT FROM '30000000-0000-0000-0000-0000000000a1'::uuid
     OR r.org_id IS DISTINCT FROM '10000000-0000-0000-0000-00000000000a'::uuid
     OR r.actor IS DISTINCT FROM '00000000-0000-0000-0000-0000000000a1'::uuid
     OR r.changes IS DISTINCT FROM '{"purged": true, "rows": 9}'::jsonb THEN
    RAISE EXCEPTION 'check purge_admin_only: purge row %', to_jsonb(r);
  END IF;
  -- every history row of a purged record is scrubbed (the company's update + soft delete, and the purge's own deletes)
  IF EXISTS (SELECT 1 FROM crm_history WHERE action <> 'purge' AND changes IS DISTINCT FROM '{"purged": true}'::jsonb
             AND record_id IN ('30000000-0000-0000-0000-0000000000a1','40000000-0000-0000-0000-0000000000a1',
                               '40000000-0000-0000-0000-0000000000a2','31000000-0000-0000-0000-0000000000a1')
             AND entity IN ('companies','deals','contacts')) THEN
    RAISE EXCEPTION 'check purge_admin_only: unscrubbed history of a purged record';
  END IF;
  IF (SELECT count(*) FROM crm_history WHERE entity = 'deal_contacts' AND record_id = '40000000-0000-0000-0000-0000000000a5'
      AND changes = '{"purged": true}'::jsonb) < 3 THEN   -- insert, update and the cascaded delete of the a5 link
    RAISE EXCEPTION 'check purge_admin_only: deal_contacts link of the purged contact not scrubbed';
  END IF;
  IF (SELECT count(*) FROM crm_history WHERE changes = '{"purged": true}'::jsonb) < 18 THEN   -- 9 soft deletes + 9 hard deletes, at least
    RAISE EXCEPTION 'check purge_admin_only: only % scrubbed rows', (SELECT count(*) FROM crm_history WHERE changes = '{"purged": true}'::jsonb);
  END IF;
  IF EXISTS (SELECT 1 FROM crm_history
             WHERE changes::text ~ '(Bakkerij Jansen|Jan Jansen|Website Jansen|SEO Jansen|Eerste notitie|Gebeld|Naar Won|Belafspraak|Voorbereiding|Notitie|Rol Geheim)') THEN
    RAISE EXCEPTION 'check purge_admin_only: personal data left in history';
  END IF;
END $$;
ROLLBACK;

-- meeting_ignores_trash: the RPC (definer, bypasses RLS) treats a trashed deal, or a deal of a trashed company, as not found
BEGIN;
INSERT INTO meeting_imports (id, org_id, meeting_date, transcript, status) VALUES
  ('50000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','2026-11-03','x','ready');
INSERT INTO meeting_proposals (id, org_id, import_id, position, kind, company_label, deal_id, payload, quote) VALUES
  ('60000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-0000000000a1',0,'note','Jansen',
   '40000000-0000-0000-0000-0000000000a1','{"body":"x"}','x'),
  ('60000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-0000000000a1',1,'note','De Hoek',
   '40000000-0000-0000-0000-0000000000a4','{"body":"x"}','x');
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1';
UPDATE companies SET deleted_at = now() WHERE id = '30000000-0000-0000-0000-0000000000a2';   -- company alone in the trash
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r jsonb; BEGIN
  r := apply_meeting_proposal('60000000-0000-0000-0000-0000000000a1', jsonb_build_object('deal_id','40000000-0000-0000-0000-0000000000a1','payload','{"body":"x"}'::jsonb));
  IF coalesce((r->>'ok')::boolean, true) OR r->>'error' IS DISTINCT FROM 'Deal niet gevonden' THEN
    RAISE EXCEPTION 'check meeting_ignores_trash: trashed deal: %', r;
  END IF;
  r := apply_meeting_proposal('60000000-0000-0000-0000-0000000000a2', jsonb_build_object('deal_id','40000000-0000-0000-0000-0000000000a4','payload','{"body":"x"}'::jsonb));
  IF coalesce((r->>'ok')::boolean, true) OR r->>'error' IS DISTINCT FROM 'Deal niet gevonden' THEN
    RAISE EXCEPTION 'check meeting_ignores_trash: deal of trashed company: %', r;
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM deal_activities WHERE body LIKE 'Uit sales-meeting%') THEN
    RAISE EXCEPTION 'check meeting_ignores_trash: note written on a trashed deal';
  END IF;
END $$;
ROLLBACK;

-- trash_parent_guard: nothing live can be attached to a trashed deal/company (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1';
DELETE FROM companies WHERE id = '30000000-0000-0000-0000-0000000000a2';
DO $$ DECLARE v_err text; BEGIN
  v_err := NULL;
  BEGIN
    INSERT INTO deal_activities (org_id, deal_id, type, body)
    VALUES ('10000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-0000000000a1','note','notitie op prullenbak-deal');
  EXCEPTION WHEN others THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'Dit item staat in de prullenbak' THEN RAISE EXCEPTION 'check trash_parent_guard: note on trashed deal: %', v_err; END IF;
  v_err := NULL;
  BEGIN
    INSERT INTO crm_appointments (org_id, deal_id, owner_id, type, title, starts_at)
    VALUES ('10000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2','call','x','2026-12-01T09:00:00Z');
  EXCEPTION WHEN others THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'Dit item staat in de prullenbak' THEN RAISE EXCEPTION 'check trash_parent_guard: appointment on trashed deal: %', v_err; END IF;
  v_err := NULL;
  BEGIN
    INSERT INTO company_items (org_id, company_id, item_type, title)
    VALUES ('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-0000000000a2','note','x');
  EXCEPTION WHEN others THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'Dit item staat in de prullenbak' THEN RAISE EXCEPTION 'check trash_parent_guard: item on trashed company: %', v_err; END IF;
  v_err := NULL;
  BEGIN
    UPDATE deals SET company_id = '30000000-0000-0000-0000-0000000000a2' WHERE id = '40000000-0000-0000-0000-0000000000a2';
  EXCEPTION WHEN others THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'Dit item staat in de prullenbak' THEN RAISE EXCEPTION 'check trash_parent_guard: deal moved to trashed company: %', v_err; END IF;
  -- ordinary edits of live rows still work
  UPDATE deals SET title = 'SEO Jansen v2' WHERE id = '40000000-0000-0000-0000-0000000000a2';
  IF NOT FOUND THEN RAISE EXCEPTION 'check trash_parent_guard: ordinary edit blocked'; END IF;
END $$;
ROLLBACK;

-- purge_live_child: a live child forced under a trashed deal blocks the purge; nothing is deleted (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1';
RESET ROLE;
SET LOCAL session_replication_role = replica;   -- superuser bypasses the guard trigger to force the bad state
INSERT INTO deal_activities (org_id, deal_id, type, body)
VALUES ('10000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-0000000000a1','note','levende notitie');
SET LOCAL session_replication_role = origin;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_err text; BEGIN
  BEGIN PERFORM crm_purge('deals', '40000000-0000-0000-0000-0000000000a1');
  EXCEPTION WHEN others THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'Er hangen nog actieve gegevens aan dit item; zet die eerst in de prullenbak' THEN
    RAISE EXCEPTION 'check purge_live_child: purge not refused: %', v_err;
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1' AND deleted_at IS NOT NULL)
     OR (SELECT count(*) FROM deal_activities WHERE deal_id = '40000000-0000-0000-0000-0000000000a1') IS DISTINCT FROM 3::bigint
     OR (SELECT count(*) FROM crm_appointments WHERE deal_id = '40000000-0000-0000-0000-0000000000a1') IS DISTINCT FROM 1::bigint
     OR EXISTS (SELECT 1 FROM crm_history WHERE action = 'purge' OR changes = '{"purged": true}'::jsonb) THEN
    RAISE EXCEPTION 'check purge_live_child: something was deleted or scrubbed';
  END IF;
END $$;
ROLLBACK;

-- purge_generic_error: a non-admin gets the same error for an unknown id as for a real trashed record (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1';
DO $$ DECLARE e1 text; e2 text; BEGIN
  BEGIN PERFORM crm_purge('deals', gen_random_uuid()); EXCEPTION WHEN others THEN e1 := SQLERRM; END;
  BEGIN PERFORM crm_purge('deals', '40000000-0000-0000-0000-0000000000a1'); EXCEPTION WHEN others THEN e2 := SQLERRM; END;
  IF e1 IS NULL OR e1 IS DISTINCT FROM e2 THEN RAISE EXCEPTION 'check purge_generic_error: % / %', e1, e2; END IF;
END $$;
ROLLBACK;

-- org_delete_fails: deleting an organization is refused (fail-safe), nothing changes (rolled back)
DO $$ DECLARE ok boolean := false; BEGIN
  BEGIN
    DELETE FROM organizations WHERE id = '10000000-0000-0000-0000-00000000000c';
  EXCEPTION WHEN others THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check org_delete_fails: organization delete succeeded'; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = '10000000-0000-0000-0000-00000000000c')
     OR (SELECT count(*) FROM deals WHERE org_id = '10000000-0000-0000-0000-00000000000c') IS DISTINCT FROM 3::bigint
     OR EXISTS (SELECT 1 FROM deals WHERE deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'check org_delete_fails: data changed';
  END IF;
END $$;

-- stage_delete_guard: a stage whose only deal is trashed cannot be deleted; a stage without deals can (rolled back)
BEGIN;
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1';   -- the only deal in Prospect, now trashed
DO $$ DECLARE v_err text; BEGIN
  BEGIN DELETE FROM pipeline_stages WHERE id = '20000000-0000-0000-0000-0000000000a1';
  EXCEPTION WHEN others THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'Deze fase heeft nog deals (ook in de prullenbak)' THEN
    RAISE EXCEPTION 'check stage_delete_guard: delete not refused: %', v_err;
  END IF;
  IF (SELECT stage_id FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1') IS DISTINCT FROM '20000000-0000-0000-0000-0000000000a1'::uuid THEN
    RAISE EXCEPTION 'check stage_delete_guard: trashed deal lost its stage';
  END IF;
  DELETE FROM pipeline_stages WHERE id = '20000000-0000-0000-0000-0000000000c2';   -- Offerte: no deals
  IF EXISTS (SELECT 1 FROM pipeline_stages WHERE id = '20000000-0000-0000-0000-0000000000c2') THEN
    RAISE EXCEPTION 'check stage_delete_guard: empty stage not deleted';
  END IF;
END $$;
ROLLBACK;

-- trash checks left the fixtures as they were
DO $$ BEGIN
  IF (SELECT count(*) FROM deals) <> 8 OR EXISTS (SELECT 1 FROM crm_history) OR EXISTS (SELECT 1 FROM meeting_proposals)
     OR EXISTS (SELECT 1 FROM deals WHERE deleted_at IS NOT NULL) OR EXISTS (SELECT 1 FROM companies WHERE deleted_at IS NOT NULL)
     OR (SELECT count(*) FROM deal_activities) <> 4 OR (SELECT count(*) FROM contacts) <> 3 THEN
    RAISE EXCEPTION 'check trash: fixtures changed';
  END IF;
END $$;

-- ===== Final review fixes =====
-- purge_files: crm_purge returns the storage paths of every company_item it removed, including an item of an
-- earlier batch that the company FK cascade takes along; a purge without documents returns [] (rolled back)
BEGIN;
UPDATE company_items SET storage_path = '10000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-0000000000a1/offerte.pdf'
  WHERE company_id = '30000000-0000-0000-0000-0000000000a1';
INSERT INTO company_items (org_id, company_id, item_type, title, file_name, storage_path) VALUES
 ('10000000-0000-0000-0000-00000000000a','30000000-0000-0000-0000-0000000000a1','document','Los document','los.pdf',
  '10000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-0000000000a1/los.pdf');
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DELETE FROM company_items WHERE file_name = 'los.pdf';                       -- own batch first
DELETE FROM companies WHERE id = '30000000-0000-0000-0000-0000000000a1';     -- then the company
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a5';         -- a deal without documents
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_res jsonb; BEGIN
  v_res := crm_purge('companies', '30000000-0000-0000-0000-0000000000a1');
  IF (v_res ->> 'rows')::int IS DISTINCT FROM 9
     OR (SELECT array_agg(f ORDER BY f) FROM jsonb_array_elements_text(v_res -> 'files') f) IS DISTINCT FROM ARRAY[
          '10000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-0000000000a1/los.pdf',
          '10000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-0000000000a1/offerte.pdf'] THEN
    RAISE EXCEPTION 'check purge_files: company purge returned %', v_res;
  END IF;
  v_res := crm_purge('deals', '40000000-0000-0000-0000-0000000000a5');
  IF v_res -> 'files' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'check purge_files: deal purge returned %', v_res; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM company_items WHERE company_id = '30000000-0000-0000-0000-0000000000a1') THEN
    RAISE EXCEPTION 'check purge_files: items of the purged company still exist';
  END IF;
END $$;
ROLLBACK;

-- trash_batch_counts: crm_trash_list reports what a batch holds besides its head, per entity (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DELETE FROM deal_activities WHERE body = 'Gebeld';
DELETE FROM companies WHERE id = '30000000-0000-0000-0000-0000000000a1';
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a5';
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM crm_trash_list('10000000-0000-0000-0000-00000000000a') WHERE entity = 'companies';
  IF NOT FOUND THEN RAISE EXCEPTION 'check trash_batch_counts: company head missing'; END IF;
  IF r.batch_counts IS DISTINCT FROM '{"deals": 2, "contacts": 1, "company_items": 1, "deal_activities": 2, "crm_appointments": 1}'::jsonb THEN
    RAISE EXCEPTION 'check trash_batch_counts: company %', r.batch_counts;
  END IF;
  SELECT * INTO r FROM crm_trash_list('10000000-0000-0000-0000-00000000000a') WHERE entity = 'deals';
  IF NOT FOUND THEN RAISE EXCEPTION 'check trash_batch_counts: deal head missing'; END IF;
  -- deal_fees are not in the trash, but a purge of the deal removes them too
  IF r.batch_counts IS DISTINCT FROM '{"deal_fees": 2, "deal_activities": 1, "crm_appointments": 1}'::jsonb THEN
    RAISE EXCEPTION 'check trash_batch_counts: deal %', r.batch_counts;
  END IF;
  SELECT * INTO r FROM crm_trash_list('10000000-0000-0000-0000-00000000000a') WHERE entity = 'deal_activities';
  IF NOT FOUND THEN RAISE EXCEPTION 'check trash_batch_counts: activity head missing'; END IF;
  IF r.batch_counts IS DISTINCT FROM '{}'::jsonb THEN RAISE EXCEPTION 'check trash_batch_counts: activity %', r.batch_counts; END IF;
END $$;
ROLLBACK;

-- funnel_default_creates: a deal inserted for an org without any funnel gets a new funnel instead of failing (rolled back)
BEGIN;
INSERT INTO organizations (id, slug, name) VALUES ('10000000-0000-0000-0000-0000000000ff','leeg','Lege org');
INSERT INTO deals (id, org_id, title) VALUES ('40000000-0000-0000-0000-0000000000ff','10000000-0000-0000-0000-0000000000ff','Eerste deal');
DO $$ DECLARE v uuid; BEGIN
  SELECT funnel_id INTO v FROM deals WHERE id = '40000000-0000-0000-0000-0000000000ff';
  IF NOT FOUND OR v IS NULL
     OR NOT EXISTS (SELECT 1 FROM funnels WHERE id = v AND org_id = '10000000-0000-0000-0000-0000000000ff') THEN
    RAISE EXCEPTION 'check funnel_default_creates: deal got funnel %', v;
  END IF;
END $$;
ROLLBACK;

-- org_admin_self: is_org_admin(_org) answers for the caller only; the 2-arg version stays executable for
-- authenticated because the funnels / crm_fields policies call it as the caller
BEGIN;
DO $$ BEGIN
  IF NOT has_function_privilege('authenticated', 'public.is_org_admin(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.is_org_admin(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.is_org_admin(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'check org_admin_self: grants';
  END IF;
END $$;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF is_org_admin('10000000-0000-0000-0000-00000000000a'::uuid) THEN RAISE EXCEPTION 'check org_admin_self: member is org admin'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT is_org_admin('10000000-0000-0000-0000-00000000000c'::uuid) THEN RAISE EXCEPTION 'check org_admin_self: global admin not org admin'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', '', true); END $$;
DO $$ BEGIN
  IF is_org_admin('10000000-0000-0000-0000-00000000000c'::uuid) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'check org_admin_self: anonymous caller must get false';
  END IF;
END $$;
ROLLBACK;

-- purge_guc_documented: crm_purge and crm_soft_delete warn never to expose set_config('crm.purge', ...)
DO $$ BEGIN
  IF coalesce(obj_description('public.crm_purge(text, uuid)'::regprocedure, 'pg_proc'), '') NOT LIKE '%set_config(''crm.purge''%'
     OR coalesce(obj_description('public.crm_soft_delete()'::regprocedure, 'pg_proc'), '') NOT LIKE '%set_config(''crm.purge''%' THEN
    RAISE EXCEPTION 'check purge_guc_documented: warning missing';
  END IF;
END $$;

-- ===== Plan 3 task 1: crm_tasks (table, completion, link guard, history, trash) =====
-- Every check adds its own task rows inside BEGIN ... ROLLBACK; the fixtures hold no tasks.
-- Ids: org L 10..0a, org C 10..0c, member u_member 00..a2 (org L only), super admin u_admin 00..a1,
-- deal a1 40..a1 (org L), deal c1 40..c1 (org C), company Cafe De Hoek 30..a2, contact Losse Lars 31..a3.

-- tasks_counts_key: crm_integrity_counts gains crm_tasks (all rows, trashed included)
DO $$ DECLARE l jsonb; BEGIN
  l := crm_integrity_counts('10000000-0000-0000-0000-00000000000a');
  IF NOT l ? 'crm_tasks' OR (l->>'crm_tasks')::int IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'check tasks_counts_key: %', l; END IF;
END $$;

-- tasks_rls: a member sees only own-org tasks, can create in own org, not in another org (rolled back)
BEGIN;
INSERT INTO crm_tasks (id, org_id, title) VALUES
 ('50000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','Taak L'),
 ('50000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-00000000000c','Taak C');
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v uuid; ok boolean := false; BEGIN
  IF (SELECT count(*) FROM crm_tasks) IS DISTINCT FROM 1::bigint
     OR NOT EXISTS (SELECT 1 FROM crm_tasks WHERE id = '50000000-0000-0000-0000-0000000000a1') THEN
    RAISE EXCEPTION 'check tasks_rls: member sees % tasks', (SELECT count(*) FROM crm_tasks);
  END IF;
  INSERT INTO crm_tasks (org_id, title, type, priority) VALUES ('10000000-0000-0000-0000-00000000000a','Bellen met Jan','call','high')
    RETURNING created_by INTO v;
  IF v IS DISTINCT FROM '00000000-0000-0000-0000-0000000000a2'::uuid THEN RAISE EXCEPTION 'check tasks_rls: created_by %', v; END IF;
  BEGIN
    INSERT INTO crm_tasks (org_id, title) VALUES ('10000000-0000-0000-0000-00000000000c','Inbraak');
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'check tasks_rls: member created a task in another org'; END IF;
  UPDATE crm_tasks SET title = 'Gekaapt' WHERE id = '50000000-0000-0000-0000-0000000000c1';
  DELETE FROM crm_tasks WHERE id = '50000000-0000-0000-0000-0000000000c1';
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM crm_tasks WHERE id = '50000000-0000-0000-0000-0000000000c1' AND title = 'Taak C' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'check tasks_rls: member changed another org''s task';
  END IF;
  IF has_table_privilege('anon', 'public.crm_tasks', 'SELECT') THEN RAISE EXCEPTION 'check tasks_rls: anon can read tasks'; END IF;
END $$;
ROLLBACK;

-- tasks_defaults_and_checks: defaults, empty title and unknown values refused (rolled back)
BEGIN;
DO $$ DECLARE r crm_tasks%ROWTYPE; n int := 0; BEGIN
  INSERT INTO crm_tasks (org_id, title) VALUES ('10000000-0000-0000-0000-00000000000a','Standaard') RETURNING * INTO r;
  IF r.type IS DISTINCT FROM 'todo' OR r.priority IS DISTINCT FROM 'medium' OR r.status IS DISTINCT FROM 'open'
     OR r.completed_at IS NOT NULL OR r.created_at IS NULL OR r.updated_at IS NULL THEN
    RAISE EXCEPTION 'check tasks_defaults: %', to_jsonb(r);
  END IF;
  BEGIN INSERT INTO crm_tasks (org_id, title) VALUES ('10000000-0000-0000-0000-00000000000a','   '); EXCEPTION WHEN check_violation THEN n := n + 1; END;
  BEGIN INSERT INTO crm_tasks (org_id, title, type) VALUES ('10000000-0000-0000-0000-00000000000a','x','meeting'); EXCEPTION WHEN check_violation THEN n := n + 1; END;
  BEGIN INSERT INTO crm_tasks (org_id, title, priority) VALUES ('10000000-0000-0000-0000-00000000000a','x','urgent'); EXCEPTION WHEN check_violation THEN n := n + 1; END;
  BEGIN INSERT INTO crm_tasks (org_id, title, status) VALUES ('10000000-0000-0000-0000-00000000000a','x','later'); EXCEPTION WHEN check_violation THEN n := n + 1; END;
  IF n IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'check tasks_defaults: only % of 4 bad values refused', n; END IF;
END $$;
ROLLBACK;

-- tasks_completion: open -> done sets completed_at/by (the member), done -> open clears both (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE r crm_tasks%ROWTYPE; v_at timestamptz; BEGIN
  INSERT INTO crm_tasks (id, org_id, title, completed_at, completed_by)
  VALUES ('50000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','Offerte sturen', now(), gen_random_uuid())
  RETURNING * INTO r;
  IF r.completed_at IS NOT NULL OR r.completed_by IS NOT NULL THEN RAISE EXCEPTION 'check tasks_completion: open task inserted as completed'; END IF;
  UPDATE crm_tasks SET status = 'done' WHERE id = r.id RETURNING * INTO r;
  IF NOT FOUND OR r.completed_at IS NULL OR r.completed_by IS DISTINCT FROM '00000000-0000-0000-0000-0000000000a2'::uuid THEN
    RAISE EXCEPTION 'check tasks_completion: done gave % / %', r.completed_at, r.completed_by;
  END IF;
  v_at := r.completed_at;
  UPDATE crm_tasks SET status = 'done', title = 'Offerte verstuurd' WHERE id = r.id RETURNING * INTO r;
  IF r.completed_at IS DISTINCT FROM v_at THEN RAISE EXCEPTION 'check tasks_completion: done -> done moved completed_at'; END IF;
  UPDATE crm_tasks SET status = 'open' WHERE id = r.id RETURNING * INTO r;
  IF r.completed_at IS NOT NULL OR r.completed_by IS NOT NULL THEN RAISE EXCEPTION 'check tasks_completion: reopen kept completion'; END IF;
  UPDATE crm_tasks SET completed_at = now() WHERE id = r.id RETURNING * INTO r;
  IF r.completed_at IS NOT NULL THEN RAISE EXCEPTION 'check tasks_completion: open task got completed_at by hand'; END IF;
  INSERT INTO crm_tasks (org_id, title, status) VALUES ('10000000-0000-0000-0000-00000000000a','Al gedaan','done') RETURNING * INTO r;
  IF r.completed_at IS NULL OR r.completed_by IS NULL THEN RAISE EXCEPTION 'check tasks_completion: insert as done not completed'; END IF;
END $$;
ROLLBACK;

-- tasks_links_guard: a cross-org deal link and a trashed contact link are refused; same-org links pass (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DELETE FROM contacts WHERE id = '31000000-0000-0000-0000-0000000000a3';
DO $$ DECLARE e1 text; e2 text; e3 text; e4 text; BEGIN
  BEGIN INSERT INTO crm_tasks (org_id, title, deal_id) VALUES ('10000000-0000-0000-0000-00000000000a','x','40000000-0000-0000-0000-0000000000c1');
  EXCEPTION WHEN others THEN e1 := SQLERRM; END;
  BEGIN INSERT INTO crm_tasks (org_id, title, contact_id) VALUES ('10000000-0000-0000-0000-00000000000a','x','31000000-0000-0000-0000-0000000000a3');
  EXCEPTION WHEN others THEN e2 := SQLERRM; END;
  BEGIN INSERT INTO crm_tasks (org_id, title, company_id) VALUES ('10000000-0000-0000-0000-00000000000a','x',gen_random_uuid());
  EXCEPTION WHEN others THEN e3 := SQLERRM; END;
  IF e1 IS DISTINCT FROM 'Gekoppeld item hoort niet bij deze organisatie' THEN RAISE EXCEPTION 'check tasks_links_guard: cross-org deal: %', e1; END IF;
  IF e2 IS DISTINCT FROM 'Dit item staat in de prullenbak' THEN RAISE EXCEPTION 'check tasks_links_guard: trashed contact: %', e2; END IF;
  IF e3 IS DISTINCT FROM 'Gekoppeld item hoort niet bij deze organisatie' THEN RAISE EXCEPTION 'check tasks_links_guard: unknown company: %', e3; END IF;
  INSERT INTO crm_tasks (id, org_id, title, deal_id, company_id, contact_id)
  VALUES ('50000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','Goed','40000000-0000-0000-0000-0000000000a1',
          '30000000-0000-0000-0000-0000000000a1','31000000-0000-0000-0000-0000000000a1');
  BEGIN UPDATE crm_tasks SET deal_id = '40000000-0000-0000-0000-0000000000c1' WHERE id = '50000000-0000-0000-0000-0000000000a1';
  EXCEPTION WHEN others THEN e4 := SQLERRM; END;
  IF e4 IS DISTINCT FROM 'Gekoppeld item hoort niet bij deze organisatie' THEN RAISE EXCEPTION 'check tasks_links_guard: relink cross-org: %', e4; END IF;
END $$;
ROLLBACK;

-- tasks_trash_cascade: trashing a deal trashes its tasks (open and done) in the same batch, crm_restore brings
-- all back; trashing a company takes its own tasks and those of its deals (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
INSERT INTO crm_tasks (id, org_id, title, deal_id, status) VALUES
 ('50000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','Open taak deal','40000000-0000-0000-0000-0000000000a1','open'),
 ('50000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000a','Klaar taak deal','40000000-0000-0000-0000-0000000000a1','done');
INSERT INTO crm_tasks (id, org_id, title, company_id) VALUES
 ('50000000-0000-0000-0000-0000000000a3','10000000-0000-0000-0000-00000000000a','Taak bedrijf','30000000-0000-0000-0000-0000000000a2');
INSERT INTO crm_tasks (id, org_id, title, deal_id) VALUES
 ('50000000-0000-0000-0000-0000000000a4','10000000-0000-0000-0000-00000000000a','Taak deal a5','40000000-0000-0000-0000-0000000000a5');
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1';
DELETE FROM companies WHERE id = '30000000-0000-0000-0000-0000000000a2';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM crm_tasks) THEN RAISE EXCEPTION 'check tasks_trash_cascade: trashed tasks still visible'; END IF;
END $$;
RESET ROLE;
DO $$ DECLARE v_deal uuid; v_comp uuid; v_n int; BEGIN
  SELECT delete_batch INTO v_deal FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1';
  IF NOT FOUND OR v_deal IS NULL THEN RAISE EXCEPTION 'check tasks_trash_cascade: deal not trashed'; END IF;
  IF (SELECT count(*) FROM crm_tasks WHERE delete_batch = v_deal AND deleted_at IS NOT NULL
        AND id IN ('50000000-0000-0000-0000-0000000000a1','50000000-0000-0000-0000-0000000000a2')) IS DISTINCT FROM 2::bigint THEN
    RAISE EXCEPTION 'check tasks_trash_cascade: deal tasks not in the deal batch';
  END IF;
  SELECT delete_batch INTO v_comp FROM companies WHERE id = '30000000-0000-0000-0000-0000000000a2';
  IF NOT FOUND OR v_comp IS NULL THEN RAISE EXCEPTION 'check tasks_trash_cascade: company not trashed'; END IF;
  IF (SELECT count(*) FROM crm_tasks WHERE delete_batch = v_comp
        AND id IN ('50000000-0000-0000-0000-0000000000a3','50000000-0000-0000-0000-0000000000a4')) IS DISTINCT FROM 2::bigint THEN
    RAISE EXCEPTION 'check tasks_trash_cascade: company tasks not in the company batch';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true);
  v_n := crm_restore(v_deal);
  IF EXISTS (SELECT 1 FROM crm_tasks WHERE id IN ('50000000-0000-0000-0000-0000000000a1','50000000-0000-0000-0000-0000000000a2')
             AND (deleted_at IS NOT NULL OR delete_batch IS NOT NULL))
     OR EXISTS (SELECT 1 FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1' AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'check tasks_trash_cascade: restore did not bring deal + tasks back (% rows)', v_n;
  END IF;
  IF (SELECT status FROM crm_tasks WHERE id = '50000000-0000-0000-0000-0000000000a2') IS DISTINCT FROM 'done' THEN
    RAISE EXCEPTION 'check tasks_trash_cascade: restore changed a task status';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM crm_tasks WHERE id = '50000000-0000-0000-0000-0000000000a3' AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'check tasks_trash_cascade: deal restore touched the company batch';
  END IF;
  PERFORM crm_restore(v_comp);
  IF EXISTS (SELECT 1 FROM crm_tasks WHERE deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'check tasks_trash_cascade: company restore incomplete'; END IF;
END $$;
ROLLBACK;

-- tasks_restore_guard: a trashed task cannot be restored while its deal is still in the trash (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
INSERT INTO crm_tasks (id, org_id, title, deal_id) VALUES
 ('50000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','Eerst los weg','40000000-0000-0000-0000-0000000000a1');
DELETE FROM crm_tasks WHERE id = '50000000-0000-0000-0000-0000000000a1';
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1';
DO $$ DECLARE v_err text; BEGIN
  BEGIN PERFORM crm_restore((SELECT t.delete_batch FROM crm_trash_list('10000000-0000-0000-0000-00000000000a') t WHERE t.entity = 'crm_tasks'));
  EXCEPTION WHEN others THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'Dit item staat in de prullenbak' THEN RAISE EXCEPTION 'check tasks_restore_guard: %', v_err; END IF;
END $$;
ROLLBACK;

-- tasks_purge_guard: a live task on a trashed deal blocks the purge, nothing is deleted; without it the purge
-- removes the deal's tasks and scrubs their history (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
INSERT INTO crm_tasks (id, org_id, title, deal_id) VALUES
 ('50000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','Gaat mee','40000000-0000-0000-0000-0000000000a1');
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1';
RESET ROLE;
SET LOCAL session_replication_role = replica;   -- superuser bypasses the guard trigger to force the bad state
INSERT INTO crm_tasks (id, org_id, title, deal_id) VALUES
 ('50000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000a','Levende taak','40000000-0000-0000-0000-0000000000a1');
SET LOCAL session_replication_role = origin;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_err text; BEGIN
  BEGIN PERFORM crm_purge('deals', '40000000-0000-0000-0000-0000000000a1');
  EXCEPTION WHEN others THEN v_err := SQLERRM; END;
  IF v_err IS DISTINCT FROM 'Er hangen nog actieve gegevens aan dit item; zet die eerst in de prullenbak' THEN
    RAISE EXCEPTION 'check tasks_purge_guard: purge not refused: %', v_err;
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a1')
     OR (SELECT count(*) FROM crm_tasks WHERE deal_id = '40000000-0000-0000-0000-0000000000a1') IS DISTINCT FROM 2::bigint
     OR EXISTS (SELECT 1 FROM crm_history WHERE action = 'purge' OR changes = '{"purged": true}'::jsonb) THEN
    RAISE EXCEPTION 'check tasks_purge_guard: something was deleted or scrubbed';
  END IF;
END $$;
DELETE FROM crm_tasks WHERE id = '50000000-0000-0000-0000-0000000000a2';   -- trash the live one (own batch)
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_res jsonb; BEGIN
  v_res := crm_purge('deals', '40000000-0000-0000-0000-0000000000a1');
  IF (v_res ->> 'rows')::int IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'check tasks_purge_guard: purge returned %', v_res; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM crm_tasks WHERE id = '50000000-0000-0000-0000-0000000000a1')
     OR EXISTS (SELECT 1 FROM crm_history WHERE entity = 'crm_tasks' AND record_id = '50000000-0000-0000-0000-0000000000a1'
                AND changes IS DISTINCT FROM '{"purged": true}'::jsonb) THEN
    RAISE EXCEPTION 'check tasks_purge_guard: purged task or its history left';
  END IF;
  -- the separately trashed task stays in the trash, unlinked by the FK (ON DELETE SET NULL)
  IF NOT EXISTS (SELECT 1 FROM crm_tasks WHERE id = '50000000-0000-0000-0000-0000000000a2' AND deleted_at IS NOT NULL AND deal_id IS NULL) THEN
    RAISE EXCEPTION 'check tasks_purge_guard: other batch task lost';
  END IF;
END $$;
ROLLBACK;

-- tasks_purge_task: an admin can purge a task batch by itself (rolled back)
BEGIN;
INSERT INTO crm_tasks (id, org_id, title) VALUES ('50000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','Weg ermee');
DELETE FROM crm_tasks WHERE id = '50000000-0000-0000-0000-0000000000a1';
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a1','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE v_res jsonb; BEGIN
  v_res := crm_purge('crm_tasks', '50000000-0000-0000-0000-0000000000a1');
  IF v_res IS DISTINCT FROM '{"rows": 1, "files": []}'::jsonb THEN RAISE EXCEPTION 'check tasks_purge_task: %', v_res; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM crm_tasks) THEN RAISE EXCEPTION 'check tasks_purge_task: task still there'; END IF;
END $$;
ROLLBACK;

-- tasks_history: an update writes a crm_history row with entity 'crm_tasks' and the member as actor (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
INSERT INTO crm_tasks (id, org_id, title) VALUES ('50000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','Oud');
UPDATE crm_tasks SET title = 'Nieuw', status = 'done' WHERE id = '50000000-0000-0000-0000-0000000000a1';
DO $$ DECLARE r crm_history%ROWTYPE; BEGIN
  SELECT * INTO r FROM crm_history WHERE entity = 'crm_tasks' AND record_id = '50000000-0000-0000-0000-0000000000a1' AND action = 'update';
  IF NOT FOUND THEN RAISE EXCEPTION 'check tasks_history: no update row'; END IF;
  IF r.actor IS DISTINCT FROM '00000000-0000-0000-0000-0000000000a2'::uuid
     OR r.changes -> 'title' IS DISTINCT FROM '{"from": "Oud", "to": "Nieuw"}'::jsonb
     OR r.changes -> 'status' IS DISTINCT FROM '{"from": "open", "to": "done"}'::jsonb
     OR NOT r.changes ? 'completed_at' THEN
    RAISE EXCEPTION 'check tasks_history: row %', to_jsonb(r);
  END IF;
  IF (SELECT count(*) FROM crm_history WHERE entity = 'crm_tasks') IS DISTINCT FROM 2::bigint THEN
    RAISE EXCEPTION 'check tasks_history: expected insert + update rows';
  END IF;
END $$;
ROLLBACK;

-- tasks_trash_list: a trashed task is its own batch head (label = title); a deal batch counts its tasks (rolled back)
BEGIN;
DO $$ BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000a2','role','authenticated')::text, true); END $$;
SET LOCAL ROLE authenticated;
INSERT INTO crm_tasks (id, org_id, title, deal_id) VALUES
 ('50000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-00000000000a','Losse taak',NULL),
 ('50000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-00000000000a','Taak van deal','40000000-0000-0000-0000-0000000000a5');
DELETE FROM crm_tasks WHERE id = '50000000-0000-0000-0000-0000000000a1';
DELETE FROM deals WHERE id = '40000000-0000-0000-0000-0000000000a5';
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM crm_trash_list('10000000-0000-0000-0000-00000000000a') WHERE entity = 'crm_tasks';
  IF NOT FOUND THEN RAISE EXCEPTION 'check tasks_trash_list: task head missing'; END IF;
  IF r.record_id IS DISTINCT FROM '50000000-0000-0000-0000-0000000000a1'::uuid OR r.label IS DISTINCT FROM 'Losse taak'
     OR r.batch_size IS DISTINCT FROM 1 OR r.batch_counts IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'check tasks_trash_list: task head %', to_jsonb(r);
  END IF;
  SELECT * INTO r FROM crm_trash_list('10000000-0000-0000-0000-00000000000a') WHERE entity = 'deals';
  IF NOT FOUND THEN RAISE EXCEPTION 'check tasks_trash_list: deal head missing'; END IF;
  IF r.batch_counts IS DISTINCT FROM '{"crm_tasks": 1, "deal_fees": 2, "deal_activities": 1, "crm_appointments": 1}'::jsonb THEN
    RAISE EXCEPTION 'check tasks_trash_list: deal %', r.batch_counts;
  END IF;
  IF (SELECT count(*) FROM crm_trash_list('10000000-0000-0000-0000-00000000000a')) IS DISTINCT FROM 2::bigint THEN
    RAISE EXCEPTION 'check tasks_trash_list: expected 2 batch heads';
  END IF;
END $$;
ROLLBACK;

-- task checks left the fixtures as they were
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM crm_tasks) OR EXISTS (SELECT 1 FROM crm_history) OR (SELECT count(*) FROM deals) <> 8
     OR EXISTS (SELECT 1 FROM deals WHERE deleted_at IS NOT NULL) OR EXISTS (SELECT 1 FROM contacts WHERE deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'check tasks: fixtures changed';
  END IF;
END $$;

-- (later tasks append checks here)

DO $$ BEGIN RAISE NOTICE 'CRM FOUNDATION CHECKS PASSED'; END $$;
