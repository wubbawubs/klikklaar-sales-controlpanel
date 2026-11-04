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

-- (later tasks append checks here)

DO $$ BEGIN RAISE NOTICE 'CRM FOUNDATION CHECKS PASSED'; END $$;
