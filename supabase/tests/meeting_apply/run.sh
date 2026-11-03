#!/bin/sh
# Usage: supabase/tests/meeting_apply/run.sh  (needs Docker). Spins up a throwaway Postgres, runs the checks, removes it.
set -e
cd "$(dirname "$0")/../../.."
NAME=kk-meeting-test-$$
docker run -d --rm --name $NAME -e POSTGRES_PASSWORD=test postgres:17-alpine >/dev/null
trap 'docker stop $NAME >/dev/null' EXIT
until docker exec $NAME pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 1
for f in supabase/tests/meeting_apply/stub_schema.sql supabase/migrations/20261103000001_meeting_imports.sql supabase/tests/meeting_apply/checks.sql; do
  docker exec -i $NAME psql -q -v ON_ERROR_STOP=1 -U postgres < "$f"
done
