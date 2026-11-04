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

-- (later tasks append checks here)

DO $$ BEGIN RAISE NOTICE 'CRM FOUNDATION CHECKS PASSED'; END $$;
