-- Fixtures on the LIVE schema: only auth users + roles (finance tables exist after the migration; see checks.sql).
--  f1 super_admin, f2 (viewer), f3 (manager), f4 (no finance), f5 (plain admin, no finance)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$f$;

INSERT INTO auth.users (id, email, aud, role, instance_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1','f1@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
 ('00000000-0000-0000-0000-0000000000f2','f2@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
 ('00000000-0000-0000-0000-0000000000f3','f3@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
 ('00000000-0000-0000-0000-0000000000f4','f4@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
 ('00000000-0000-0000-0000-0000000000f5','f5@test.local','authenticated','authenticated','00000000-0000-0000-0000-000000000000');

INSERT INTO user_roles (user_id, role) VALUES
 ('00000000-0000-0000-0000-0000000000f1','super_admin'),
 ('00000000-0000-0000-0000-0000000000f2','sales_executive'),
 ('00000000-0000-0000-0000-0000000000f3','sales_executive'),
 ('00000000-0000-0000-0000-0000000000f4','sales_executive'),
 ('00000000-0000-0000-0000-0000000000f5','admin');
