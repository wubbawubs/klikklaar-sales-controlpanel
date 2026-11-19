-- Finance access checks. Run after live schema + fixtures + migrations.
-- Seed (as superuser)
INSERT INTO finance_companies (id, name, excluded) VALUES
 ('00000000-0000-0000-0000-0000000000c1','A',false),('00000000-0000-0000-0000-0000000000c2','B',false),('00000000-0000-0000-0000-0000000000c3','C',true);
INSERT INTO finance_access (user_id, level) VALUES ('00000000-0000-0000-0000-0000000000f2','view'),('00000000-0000-0000-0000-0000000000f3','manage');
INSERT INTO finance_company_access (user_id, company_id) VALUES ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c3');

BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_companies) <> 3 THEN RAISE EXCEPTION 'check visible_f1: got %', (SELECT count(*) FROM finance_companies); END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_companies) <> 1 THEN RAISE EXCEPTION 'check visible_f2: got %', (SELECT count(*) FROM finance_companies); END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_companies) <> 1 THEN RAISE EXCEPTION 'check visible_f3: got %', (SELECT count(*) FROM finance_companies); END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f4','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_companies) <> 0 THEN RAISE EXCEPTION 'check visible_f4: got %', (SELECT count(*) FROM finance_companies); END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f5','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_companies) <> 0 THEN RAISE EXCEPTION 'check visible_f5: got %', (SELECT count(*) FROM finance_companies); END IF; END $$;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE r record; BEGIN SELECT * INTO r FROM finance_me();
  IF r.has_access IS DISTINCT FROM true OR r.level IS DISTINCT FROM 'manage' OR r.is_super_admin IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'check finance_me f1: got %,%,%', r.has_access, r.level, r.is_super_admin; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE r record; BEGIN SELECT * INTO r FROM finance_me();
  IF r.has_access IS DISTINCT FROM true OR r.level IS DISTINCT FROM 'view' OR r.is_super_admin IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'check finance_me f2: got %,%,%', r.has_access, r.level, r.is_super_admin; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f4','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE r record; BEGIN SELECT * INTO r FROM finance_me();
  IF r.has_access IS DISTINCT FROM false OR r.level IS DISTINCT FROM NULL::text OR r.is_super_admin IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'check finance_me f4: got %,%,%', r.has_access, r.level, r.is_super_admin; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  UPDATE finance_companies SET min_buffer=1 WHERE id='00000000-0000-0000-0000-0000000000c1'; GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'check update f2 on c1: % rows', n; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  UPDATE finance_companies SET min_buffer=1 WHERE id='00000000-0000-0000-0000-0000000000c1'; GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'check update f3 on c1: % rows', n; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  UPDATE finance_companies SET min_buffer=1 WHERE id='00000000-0000-0000-0000-0000000000c2'; GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'check update f3 on c2: % rows', n; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f3','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO finance_company_access (user_id, company_id) VALUES ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c2');
    RAISE EXCEPTION 'check access_write: f3 insert should have failed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN INSERT INTO finance_company_access (user_id, company_id) VALUES ('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000c2'); END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f2','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM finance_access) <> 1 OR (SELECT count(*) FROM finance_access WHERE user_id <> '00000000-0000-0000-0000-0000000000f2') <> 0 THEN RAISE EXCEPTION 'check finance_access f2 own row'; END IF; END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims', json_build_object('sub','00000000-0000-0000-0000-0000000000f1','role','authenticated')::text, true); SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM finance_access) <> 2 THEN RAISE EXCEPTION 'check finance_access f1 all'; END IF; END $$;
ROLLBACK;
DO $$ BEGIN
  IF can_view_finance('00000000-0000-0000-0000-0000000000f5') IS NOT TRUE THEN RAISE EXCEPTION 'check can_view_finance(f5) must stay true'; END IF;
  RAISE NOTICE 'FINANCE CHECKS PASSED';
END $$;
