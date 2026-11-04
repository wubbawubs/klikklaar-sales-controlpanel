#!/bin/sh
# Usage: supabase/tests/meeting_apply/run.sh  (needs Docker). Spins up a throwaway Postgres, runs the checks, removes it.
set -e
cd "$(dirname "$0")/../../.."
NAME=kk-meeting-test-$$
docker run -d --rm --name $NAME -e POSTGRES_PASSWORD=test postgres:17-alpine >/dev/null
trap 'docker stop $NAME >/dev/null' EXIT
until docker exec $NAME pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 1
# 20261104000002 re-creates apply_meeting_proposal (won/lost by stage_type) and adds the outcome trigger.
# Migrations run as one transaction each (-1), like `supabase db push`.
docker exec -i $NAME psql -q -v ON_ERROR_STOP=1 -U postgres < supabase/tests/meeting_apply/stub_schema.sql
for f in supabase/migrations/20261103000001_meeting_imports.sql supabase/migrations/20261104000002_crm_deal_outcome.sql; do
  docker exec -i $NAME psql -1 -q -v ON_ERROR_STOP=1 -U postgres < "$f"
done
# 20261104000005 re-creates apply_meeting_proposal again (trashed deal/company = not found); load just that function
# (the rest of the trash migration needs the full schema, see supabase/tests/crm_foundation).
sed -n '/^CREATE OR REPLACE FUNCTION public.apply_meeting_proposal/,/^GRANT EXECUTE ON FUNCTION public.apply_meeting_proposal/p' \
  supabase/migrations/20261104000005_crm_trash.sql | docker exec -i $NAME psql -1 -q -v ON_ERROR_STOP=1 -U postgres
docker exec -i $NAME psql -q -v ON_ERROR_STOP=1 -U postgres < supabase/tests/meeting_apply/checks.sql
