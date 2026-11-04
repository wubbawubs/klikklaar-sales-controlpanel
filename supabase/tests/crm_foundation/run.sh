#!/bin/bash
# Usage: bash supabase/tests/crm_foundation/run.sh  (needs Docker). Loads the LIVE public schema (no data) into a
# throwaway Supabase postgres, then fixtures, new migrations (20261104000*.sql) and checks.sql.
set -e
cd "$(dirname "$0")/../../.."
ROOT=$(pwd)
DIR=supabase/tests/crm_foundation
IMAGE=public.ecr.aws/supabase/postgres:17.6.1.104
SCHEMA=$DIR/.live_schema.sql
PUSHDIR=$ROOT/.superpowers/sdd/2026-11-03-meeting-voorstellen/push

if [ ! -s "$SCHEMA" ]; then
  echo ">> regenerating live schema dump (read-only)"
  (cd "$PUSHDIR" && supabase db dump --linked -s public -f "$ROOT/$SCHEMA")
fi

NAME=kk-crm-test-$$
docker run -d --rm --name $NAME -e POSTGRES_PASSWORD=test $IMAGE >/dev/null
trap 'docker stop $NAME >/dev/null 2>&1' EXIT
psqlx() { docker exec -i -e PGPASSWORD=test $NAME psql -w -q -X -U supabase_admin -d postgres "$@"; }

# Wait until the server really accepts connections (init restarts postgres once)
ok=0
for i in $(seq 1 90); do
  if psqlx -tAc "select 1 from pg_roles where rolname='authenticated'" 2>/dev/null | grep -q 1 \
     && psqlx -tAc "select 1 from information_schema.schemata where schema_name='auth'" 2>/dev/null | grep -q 1; then ok=$((ok+1)); else ok=0; fi
  [ $ok -ge 3 ] && break
  sleep 1
done
[ $ok -ge 3 ] || { echo "postgres did not become ready"; docker logs $NAME | tail -20; exit 1; }

echo ">> loading live schema (errors tolerated, logged to $DIR/.schema_load.log)"
psqlx -v ON_ERROR_STOP=0 < "$SCHEMA" > /dev/null 2> "$DIR/.schema_load.log" || true
echo "   schema-load errors: $(grep -c ERROR "$DIR/.schema_load.log" || true)"

echo ">> asserting core tables exist"
for t in deals pipeline_stages companies contacts deal_activities crm_appointments deal_fees company_items meeting_proposals organizations; do
  psqlx -tAc "select to_regclass('public.$t') is not null" | grep -q t || { echo "MISSING TABLE: $t"; cat "$DIR/.schema_load.log" | head -20; exit 1; }
done

echo ">> fixtures"
psqlx -v ON_ERROR_STOP=1 < $DIR/fixtures.sql
for f in supabase/migrations/2026110400000*.sql; do
  [ -e "$f" ] || continue
  echo ">> migration $f"
  psqlx -v ON_ERROR_STOP=1 < "$f"
done
echo ">> checks"
psqlx -v ON_ERROR_STOP=1 < $DIR/checks.sql 2>&1 | tee /dev/stderr | grep -q "CRM FOUNDATION CHECKS PASSED"
