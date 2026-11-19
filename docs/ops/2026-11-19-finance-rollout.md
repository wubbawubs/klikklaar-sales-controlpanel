# Finance-module: uitrol naar productie (19 nov 2026)

Voor Robin en wie de uitrol met hem doet. Productie-project: `boxmdblzhuyfontwibdj`.
Claude mag in auto-modus niet naar productie pushen. Robin draait alle `push`-, `deploy`- en `secrets`-commando's zelf in zijn eigen terminal en plakt de uitvoer terug.

Wat er live gaat: twee migraties (`20261119000001_finance_access`, `20261119000002_finance_data`), twee edge functions (`exact-auth`, `exact-sync`), de nieuwe finance-schil in de frontend (`/finance/...`), en de Exact-koppeling. De oude finance-sectie (deals, Stripe, bunq, contracten) verdwijnt uit de app.

Daarvóór kun je alles lokaal uitproberen met demo-data: `bash scripts/finance-local.sh` (zie "Lokaal proberen" onderaan). Dat raakt productie niet.

## Voor je begint (lees dit eerst)

- **Nooit `supabase db push` vanuit de repo-root.** De remote migratiegeschiedenis loopt niet gelijk met de map `supabase/migrations`; veel migraties zijn met de hand toegepast. Een push vanuit de root probeert die opnieuw toe te passen. Gebruik altijd een aparte push-map (stap 2).
- **Exact Online is nodig om cijfers te zien.** Tot de koppeling in stap 6 staat, zijn de finance-pagina's leeg ("gebouwd, nog niet gekoppeld"). Dat is verwacht.
- **`can_view_finance()` blijft ongewijzigd.** Growth gebruikt die functie nog. De nieuwe toegang loopt via `finance_can_view()` en consorten; die twee bestaan naast elkaar.
- Niemand behalve `super_admin` ziet iets in finance totdat toegang expliciet aan staat (stap 9). Een globale `admin` heeft dus **geen** finance-toegang meer.

## 0. Back-up (Robin, vóór alles)

1. Supabase-dashboard, project `boxmdblzhuyfontwibdj`, **Database, Backups**. Noteer het tijdstip van de laatste back-up. Ouder dan een dag: eerst uitzoeken.
2. Eigen dump **buiten de repo** (bevat persoonsgegevens; privé houden, daarna weggooien):

   ```bash
   mkdir -p ~/Backups
   cd ~/Code/klikklaar-sales-controlpanel/.superpowers/sdd/2026-11-04-crm-fundament/push
   supabase db dump --linked --data-only -f ~/Backups/klikklaar-finance-2026-11-xx.sql
   ls -lh ~/Backups/klikklaar-finance-2026-11-xx.sql
   ```

   Vervang `xx` door de dag. Je ziet: een bestand van een paar MB of meer. De oude tabellen (`cash_positions`, `company_financials`, `contracts`, `invoices`, `bunq_state`) worden in deze uitrol **niet** gedropt, dus hier hoeft niets verloren te gaan.

## 1. Exact Online: app registreren (Robin of de Exact-beheerder)

Eenmalig, in het Exact **App Center** (`https://apps.exactonline.com`, inloggen met het Exact-account dat bij alle administraties mag):

1. Registreer een nieuwe app, bijvoorbeeld "KlikKlaar Finance".
2. **Redirect URI** (exact zo, zonder slash aan het eind):
   `https://boxmdblzhuyfontwibdj.supabase.co/functions/v1/exact-auth/callback`
3. Noteer de **Client ID** en het **Client Secret** (het secret zie je maar één keer).
4. Zorg dat de app de rechten heeft om financiele gegevens te lezen (grootboek, openstaande posten, inkoopfacturen, administraties).
5. Let op de regio: Nederland is `https://start.exactonline.nl`. Dat is de waarde voor `EXACT_BASE_URL` hieronder.

Dit zijn productiegeheimen: plak ze **nooit** in een chat of in de repo.

## 2. Push-map bouwen en dry-run

Kijk eerst wat remote al geregistreerd staat:

```bash
cd ~/Code/klikklaar-sales-controlpanel/.superpowers/sdd/2026-11-04-crm-fundament/push
supabase migration list --linked | tail -10
```

Je ziet: als laatste regels de CRM-migraties `20261104...` en `20261105...` aan beide kanten. Staat er remote iets onverwachts nieuwers, of ontbreekt een CRM-migratie: **stop** en laat het uitzoeken.

Bouw een verse map met de twee nieuwe migraties:

```bash
cd ~/Code/klikklaar-finance-dashboard
OLD=~/Code/klikklaar-sales-controlpanel/.superpowers/sdd/2026-11-04-crm-fundament/push
NEW=.superpowers/sdd/2026-11-19-finance-dashboard/push
rm -rf "$NEW" && mkdir -p "$NEW"
cp -R "$OLD/supabase" "$NEW/supabase"
cp supabase/migrations/20261119000001_finance_access.sql supabase/migrations/20261119000002_finance_data.sql "$NEW/supabase/migrations/"
ls "$NEW/supabase/migrations" | tail -5
cd "$NEW" && supabase db push --linked --dry-run
```

Je ziet: de dry-run noemt **precies twee** bestanden, `20261119000001` en `20261119000002`. Staat er iets anders of meer in de lijst: **stop**, niet pushen. (Bevat de oude push-map nog de `20261104`/`05`-bestanden en staan die remote al geregistreerd, dan zijn ze geen kandidaat; dat is goed.)

## 3. Migraties toepassen (Robin)

Zelfde map, eigen terminal:

```bash
cd ~/Code/klikklaar-finance-dashboard/.superpowers/sdd/2026-11-19-finance-dashboard/push
supabase db push --linked
```

Je ziet: twee keer "Applying migration ...". Elke migratie heeft eigen `BEGIN`/`COMMIT`; bij een fout wordt alleen die migratie teruggedraaid en kun je dezelfde push herhalen. Controle:

```bash
supabase migration list --linked | tail -4
```

Je ziet: `20261119000001` en `20261119000002` aan beide kanten.

## 4. Secrets zetten (Robin, eigen terminal)

Vervang de waarden tussen `<...>` met die uit stap 1. Geen aanhalingstekens rond de URL's laten staan.

```bash
supabase secrets set --project-ref boxmdblzhuyfontwibdj \
  EXACT_CLIENT_ID=<client-id> \
  EXACT_CLIENT_SECRET=<client-secret> \
  EXACT_REDIRECT_URI=https://boxmdblzhuyfontwibdj.supabase.co/functions/v1/exact-auth/callback \
  EXACT_BASE_URL=https://start.exactonline.nl \
  APP_URL=https://sales.klikklaarseo.nl
supabase secrets list --project-ref boxmdblzhuyfontwibdj | grep -E "EXACT|APP_URL"
```

Je ziet: vijf namen (`EXACT_CLIENT_ID`, `EXACT_CLIENT_SECRET`, `EXACT_REDIRECT_URI`, `EXACT_BASE_URL`, `APP_URL`); waarden worden als hash getoond. `EXACT_REDIRECT_URI` moet **letterlijk gelijk** zijn aan wat in het App Center staat, anders weigert Exact de koppeling.

## 5. Edge functions uitrollen en oude functies verwijderen

Pas na de migraties (de functies schrijven naar de nieuwe tabellen).

```bash
cd ~/Code/klikklaar-finance-dashboard
supabase functions deploy exact-auth --project-ref boxmdblzhuyfontwibdj
supabase functions deploy exact-sync --project-ref boxmdblzhuyfontwibdj
```

Je ziet: bij beide "Deployed Function ...". `exact-auth` moet zonder JWT bereikbaar zijn voor de callback (staat in `supabase/config.toml`); `exact-sync` controleert zelf wie er belt (service role, super_admin of finance-beheerder).

Oude functies weghalen (de oude finance-sectie gebruikte ze; de nieuwe frontend niet meer):

```bash
supabase functions delete bunq-sync --project-ref boxmdblzhuyfontwibdj
supabase functions delete stripe-summary --project-ref boxmdblzhuyfontwibdj
supabase functions list --project-ref boxmdblzhuyfontwibdj | grep -E "bunq|stripe"
```

Je ziet: geen regels meer in de laatste lijst. Doe dit pas **nadat** de nieuwe frontend live staat (stap 7), anders breekt de oude finance-pagina op het moment dat jij de functie verwijdert.

## 6. Cron-job: elk uur synchroniseren

De service-role-sleutel mag **niet** in een migratie of in de repo komen. Zet hem in Vault en laat de cron-job hem daar lezen. In de Supabase SQL-editor (productie):

```sql
-- Eenmalig: sleutel in Vault (plak de service_role key van dit project; niet delen)
select vault.create_secret('<service-role-key>', 'finance_service_key');

-- Elk uur, op minuut 5
select cron.schedule(
  'finance-exact-sync-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://boxmdblzhuyfontwibdj.supabase.co/functions/v1/exact-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'finance_service_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

select jobname, schedule, active from cron.job where jobname = 'finance-exact-sync-hourly';
```

Je ziet: een rij met `active = true`. Staat `pg_cron` of `pg_net` niet aan: Dashboard, Database, Extensions. Zet de job pas aan na de eerste handmatige sync (stap 8) zodat je fouten ziet. Uitzetten: `select cron.unschedule('finance-exact-sync-hourly');`. Een run synchroniseert binnen een tijdsbudget van ca. 110 seconden; bedrijven die nog niet aan de beurt kwamen, volgen in de run erna.

## 7. Frontend publiceren

1. Controleer het juiste project:
   ```bash
   cd ~/Code/klikklaar-finance-dashboard
   grep VITE_SUPABASE_PROJECT_ID .env
   ls .env.local 2>/dev/null
   ```
   Je ziet: `VITE_SUPABASE_PROJECT_ID="boxmdblzhuyfontwibdj"` en **geen** `.env.local` (die hoort bij de lokale demo-stack; verwijder hem anders vóór je bouwt of publiceert).
2. Merge de branch `feat/finance-dashboard` naar `main` (alleen met OK van Robin) en push `main`.
3. Publiceer via Lovable (project `d32bf8e7-c4f0-46e8-b857-540e410dd58d`).
4. Controleer de live bundle:
   ```bash
   curl -s https://sales.klikklaarseo.nl | grep -o 'assets/index-[^"]*\.js' | head -1
   curl -s https://sales.klikklaarseo.nl/assets/index-XXXX.js | grep -c boxmdblzhuyfontwibdj
   ```
   Je ziet: een getal van 1 of hoger.
5. Haal nu de oude functies weg (laatste deel van stap 5).

## 8. Eerste koppeling en sync

Als `super_admin` (alleen die mag koppelen):

1. Open `/finance`, ga naar de instellingen/koppeling en kies **Koppel Exact**. Je gaat naar het Exact-inlogscherm: log in met het account dat alle administraties ziet en geef toestemming.
2. Je komt terug in de app met "gekoppeld". Mislukt dat: kijk in de logs van `exact-auth` (Dashboard, Edge Functions, Logs). Meest voorkomend: redirect-URI niet identiek aan het App Center.
3. Start de eerste sync met de knop **Synchroniseer**. Alle administraties verschijnen als bedrijf in `finance_companies` (zonder toegang voor wie dan ook, behalve jij). Daarna volgt per bedrijf de data. Controleer per bedrijf: maand-omzet en kosten kloppen met Exact, banksaldo, open debiteuren en crediteuren.
4. Zet daarna per bedrijf het aandeel (`ownership_pct`) goed, en zet bedrijven die niet meetellen op **uitgesloten**. Uitgesloten bedrijven worden niet gesynchroniseerd en zijn voor iedereen behalve `super_admin` onzichtbaar.
5. Zet nu pas de cron-job uit stap 6 aan en controleer na een uur dat `finance_companies.last_synced_at` is opgeschoven.

### De VERIFY-punten (alleen te controleren tegen een echte administratie)

De Exact-code is gebouwd tegen de documentatie; er was nog geen echte administratie. Op deze punten staat in de code `VERIFY tegen echte administratie`. Loop ze na bij de eerste sync (`grep -rn VERIFY supabase/functions`) en pas de code aan als de werkelijkheid afwijkt:

1. `exact-sync/index.ts`, administraties ophalen: `hrm/Divisions` versus `system/Divisions`; moet alle administraties van de koppeling geven.
2. `exact-sync/index.ts`, boekjaar: aangenomen kalenderjaar (`ReportingPeriod` 1 t/m 12 is jan t/m dec). Bij een gebroken boekjaar kloppen de maanden niet.
3. `exact-sync/index.ts`, `ReportingPeriod 0` is de beginbalans van balansrekeningen; die moet in het banksaldo meetellen maar niet in omzet of kosten.
4. `exact-sync/index.ts`, `$orderby`/`$top` op `financialtransaction/TransactionLines` (datum laatste afschrift per bankrekening).
5. `exact-sync/index.ts`, teken van `Amount` in `PayablesList`: aangenomen factuur positief.
6. `_shared/exact/client.ts`, rate-limit-headers: namen kloppen en `Reset` is in epoch-milliseconden.
7. `_shared/exact/client.ts`, paginering: `__next` is een absolute URL.
8. `_shared/exact/token.ts`, tokenpad, form-velden en foutstatus (400 `invalid_grant`) bij een verlopen refresh token.
9. `_shared/exact/mapping.ts`, teken van `AmountDC` bij een inkoopcreditnota (Type 31).
10. `exact-auth/index.ts`, autorisatiepad `/api/oauth2/auth`, `force_login`, en dat Exact `state` ongewijzigd teruggeeft.

Let op: de grep geeft **10** plekken (in de opdracht stonden er 9; punt 10 is het autorisatiepad in `exact-auth`). Loop ze allemaal na.

## 9. Import uit finance-control (eenmalig)

Doel: de bestaande targets en vaste lasten uit de oude finance-control-app overnemen. Het script maakt alleen een SQL-bestand; het voert niets uit en verbindt met geen database. Vereist **Node 22.18 of nieuwer** (`node -v`).

1. **Exporteer de JSON** uit de database van finance-control (SQL-editor van dat project, per tabel, resultaat als JSON opslaan; of `Copy as JSON`/`Download` in het resultaatpaneel):
   ```sql
   select coalesce(json_agg(t), '[]'::json) from companies t;
   select coalesce(json_agg(t), '[]'::json) from revenue_targets t;
   select coalesce(json_agg(t), '[]'::json) from expenses t;
   ```
   Sla de uitkomsten op als `companies.json`, `revenue_targets.json` en `expenses.json` in een map **buiten de repo** (bevat bedrijfsgegevens), bijvoorbeeld `~/Backups/fc-export/`.
2. Maak in dezelfde map `mapping.json`: per finance-control-bedrijf het Exact-administratienummer (`exact_division`, te zien in `finance_companies` na de eerste sync):
   ```json
   { "<fc company id>": 1234567, "<fc company id 2>": 2345678 }
   ```
   Bedrijven zonder mapping worden in het resultaat als `-- NIET GEKOPPELD` gemarkeerd en overgeslagen.
3. Genereer het SQL-bestand:
   ```bash
   cd ~/Code/klikklaar-finance-dashboard
   node scripts/finance-control-import.mjs ~/Backups/fc-export
   ```
   Je ziet: `Geschreven: .../import.sql (niet uitgevoerd)`.
4. **Lees `import.sql` na** voor je iets draait: komen de bedrijven, aandelen, targets en vaste lasten overeen met wat je verwacht? Let op regels met `NIET GEKOPPELD` en `OVERGESLAGEN`.
5. Draai het bestand in de Supabase SQL-editor (productie). Het staat in een transactie. Alleen `ownership_pct` van bestaande bedrijven wordt aangepast. Let op: nieuwe vaste lasten sturen een melding naar finance-gebruikers; dat is bij een import te verwachten.
6. Gooi de export weg als je klaar bent.

## 10. Toegang aanzetten

Tot nu toe ziet alleen `super_admin` finance. Als `super_admin`, in de app onder finance-toegang beheren (of via SQL):

1. Geef per gebruiker een niveau: **view** (alleen lezen) of **manage** (targets, vaste lasten en aandeel bewerken).
2. Geef per gebruiker de bedrijven waar hij bij mag. Zonder bedrijf ziet een gebruiker niets.
3. Controleer per gebruiker door in te loggen of mee te kijken: alleen de toegewezen bedrijven, geen uitgesloten bedrijven, en view-gebruikers zien geen bewerkknoppen.
4. Alleen `super_admin` mag toegang beheren en bedrijven uitsluiten; `manage` mag alleen aandeel en minimumbuffer wijzigen (dat dwingt de database af).

## 11. Rooktest op productie

1. Als `super_admin`: alle bedrijven zichtbaar, cijfers kloppen met Exact, "laatst bijgewerkt" is recent, een bedrijf met een sync-fout toont dat.
2. Als view-gebruiker: alleen toegewezen bedrijven, geen bewerkknoppen.
3. Als manage-gebruiker: voeg een vaste lasten-regel toe; `super_admin` en finance-gebruikers met dat bedrijf krijgen de melding "Nieuwe maandlast" (de maker niet).
4. Rapport-PDF (finance, rapportage): bevat alleen bedrijven die de ingelogde gebruiker mag zien.
5. Als gewone sales-gebruiker: geen finance-menu.

## 12. Oude tabellen droppen (later, pas na een paar weken)

Wacht tot je zeker weet dat niemand de oude cijfers nog nodig heeft (minstens een maand na livegang, en na een verse back-up). Daarna in de SQL-editor:

```sql
-- Eerst controleren dat niets ze nog gebruikt
select count(*) from public.cash_positions;
select count(*) from public.company_financials;
select count(*) from public.contracts;
select count(*) from public.invoices;

drop table public.cash_positions;
drop table public.company_financials;
drop table public.contracts;
drop table public.invoices;
drop table public.bunq_state;
```

Doe dit **niet** met `cascade` zonder te hebben gekeken wat er afhangt. `can_view_finance()` laat je staan: Growth gebruikt die nog.

## Terugdraaien

- De frontend: publiceer de vorige versie via Lovable. De oude finance-sectie komt terug; haal daarvoor de functies `bunq-sync` en `stripe-summary` pas weg nadat de uitrol bevestigd is.
- Cron uitzetten: `select cron.unschedule('finance-exact-sync-hourly');`.
- De nieuwe tabellen zijn additief en kunnen blijven staan; ze raken bestaande data niet.

## Lokaal proberen (demo-omgeving)

Een eigen Supabase-stack (project `kk-finance-local`, poorten 5542x) naast eventuele andere lokale stacks, met demo-data:

```bash
bash scripts/finance-local.sh          # start, laadt schema + migraties + seed, schrijft .env.local
npm run dev                            # draait nu tegen de lokale stack
bash scripts/finance-local.sh --stop   # stopt alleen deze stack en wist de lokale data
```

Vereist Docker en `supabase/tests/crm_foundation/.live_schema.sql` (gitignored; kopieer uit de hoofdrepo). Demo-accounts, wachtwoord `demo-finance-123`: `super@demo.local` (super_admin), `kijker@demo.local` (finance view op 2 bedrijven), `beheer@demo.local` (finance manage op 3 bedrijven), `sales@demo.local` (geen finance). `.env.local` overschrijft `.env`; verwijder het bestand (of draai `--stop` en verwijder het) om weer naar de normale omgeving te gaan. Het script zet de push-trigger op `notifications` lokaal uit zodat er niets naar productie wordt gestuurd.
