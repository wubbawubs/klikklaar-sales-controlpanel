#!/bin/bash
# Lokale finance-demo: eigen Supabase-stack (project kk-finance-local, poorten 5542x) naast bestaande stacks.
# Gebruik: bash scripts/finance-local.sh          start/vul de stack en schrijf .env.local
#          bash scripts/finance-local.sh --stop   stop ALLEEN deze stack (en wis de lokale data)
# Draait nooit tegen productie: geen --linked, geen remote URL's.
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)
WORK=$ROOT/.superpowers/finance-local
PROJECT=kk-finance-local
DB=supabase_db_$PROJECT
SCHEMA=$ROOT/supabase/tests/crm_foundation/.live_schema.sql
EXCLUDE=edge-runtime,vector,imgproxy,supavisor,logflare

if [ "$1" = "--stop" ]; then
  [ -d "$WORK/supabase" ] && supabase stop --no-backup --workdir "$WORK" || echo "geen workdir, niets te stoppen"
  exit 0
fi

command -v supabase >/dev/null || { echo "supabase CLI ontbreekt"; exit 1; }
[ -s "$SCHEMA" ] || { echo "Ontbrekend: $SCHEMA (live schema-dump, gitignored; kopieer hem uit de hoofdrepo)"; exit 1; }

if [ ! -f "$WORK/supabase/config.toml" ]; then
  mkdir -p "$WORK"
  supabase init --workdir "$WORK" --force >/dev/null 2>&1
  C=$WORK/supabase/config.toml
  sed -i.bak -E 's/^project_id = .*/project_id = "'$PROJECT'"/; s/= 5432([0-9])/= 5542\1/; s/= 8083/= 8183/' "$C"
  sed -i.bak '/^\[analytics\]/,/^\[/ s/^enabled = true/enabled = false/' "$C"
  rm -f "$C.bak"
fi

echo ">> start stack ($PROJECT)"
supabase start --workdir "$WORK" -x $EXCLUDE
eval "$(supabase status --workdir "$WORK" -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
[ -n "$API_URL" ] && [ -n "$SERVICE_ROLE_KEY" ] || { echo "kon lokale sleutels niet lezen"; exit 1; }
case "$API_URL" in http://127.0.0.1:5542*) ;; *) echo "VEILIGHEIDSSTOP: API_URL $API_URL is niet de lokale stack"; exit 1;; esac

psqlx() { docker exec -i -e PGPASSWORD=postgres "$DB" psql -q -X -U postgres -d postgres "$@"; }

if ! psqlx -tAc "select to_regclass('public.finance_companies') is not null" | grep -q t; then
  echo ">> live schema + migraties laden"
  psqlx -v ON_ERROR_STOP=0 < "$SCHEMA" >/dev/null 2> "$WORK/schema_load.log" || true
  psqlx -tAc "select to_regclass('public.organizations') is not null and to_regclass('public.user_roles') is not null" | grep -q t \
    || { echo "live schema laden mislukt, zie $WORK/schema_load.log"; exit 1; }
  for f in supabase/migrations/2026110[45]*.sql supabase/migrations/20261119*.sql; do
    [ -e "$f" ] || continue
    echo "   $f"
    psqlx -v ON_ERROR_STOP=1 < "$f" >/dev/null
  done
  # Het push-trigger op notifications roept pg_net aan richting de PRODUCTIE-URL: lokaal uitzetten.
  psqlx -c 'DROP TRIGGER IF EXISTS trg_send_push_on_notification ON public.notifications;'
fi

echo ">> demo-gebruikers"
for who in super kijker beheer sales; do
  curl -s -o /dev/null -w "   $who@demo.local -> %{http_code}\n" -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$who@demo.local\",\"password\":\"demo-finance-123\",\"email_confirm\":true}"
done   # 422 = bestond al

echo ">> seed"
psqlx -v ON_ERROR_STOP=1 < supabase/seed/finance_demo.sql

cat > .env.local <<ENV
# Gegenereerd door scripts/finance-local.sh: LOKALE stack. Overschrijft .env; verwijder dit bestand om terug te gaan.
VITE_SUPABASE_URL="$API_URL"
VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
VITE_SUPABASE_PROJECT_ID="$PROJECT"
ENV
echo ">> klaar: $API_URL | studio http://127.0.0.1:55423 | demo-wachtwoord demo-finance-123 | start met: npm run dev"
