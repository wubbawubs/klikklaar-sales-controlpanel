# CRM-fundament: uitrol naar productie (4 nov 2026)

Voor Robin en wie de uitrol met hem doet. Productie-project: `boxmdblzhuyfontwibdj`.
Claude mag in auto-modus niet naar productie pushen. Robin draait de `push`- en `deploy`-commando's zelf in zijn eigen terminal (zonder `!`-prefix) en plakt de uitvoer terug.

Wat er live gaat: vijf migraties (`20261104000001` t/m `05`), twee edge functions (`meeting-analyze`, `pipeline-summary`) en de frontend (stage-types, `/prullenbak`, foutmelding bij mislukt opslaan).

## Voor je begint (lees dit eerst)

- **Nooit `supabase db push` vanuit de repo-root.** De remote migratiegeschiedenis stopte op 3 november bij `20260610000004`; sindsdien is daar alleen `20261103000001` (meeting-voorstellen) bijgekomen. Veel migraties daartussen zijn met de hand toegepast en staan niet in de remote geschiedenis. Een push vanuit de root zou die opnieuw proberen toe te passen. Gebruik altijd de aparte push-map uit stap 2.
- **Push op een rustig moment.** Migratie 1 neemt een paar seconden een `ACCESS EXCLUSIVE`-lock op `deals`, `pipeline_stages` en `organizations` (ook lezen wacht), en een `SHARE`-lock op `companies`, `contacts`, `deal_activities`, `crm_appointments`, `deal_fees` en `company_items` (lezen gaat door, schrijven wacht). Migratie 5 neemt kort een `ACCESS EXCLUSIVE`-lock op de zes CRM-tabellen. Is het druk, dan stopt `lock_timeout` (5s) die migratie netjes.
- **Elke migratie draait in een eigen expliciete transactie (BEGIN/COMMIT in het bestand zelf; de CLI wikkelt niets).** Elke migratie controleert zichzelf; bij een afwijking in de data-integriteit (of een lock-timeout) stopt hij en wordt **alleen die migratie** teruggedraaid. De migraties ervóór blijven toegepast. Dat is veilig: de oude frontend blijft daarop werken. Opnieuw `supabase db push --linked` draaien gaat verder bij de migratie die stopte. Waar je staat zie je met `supabase migration list --linked`.
- Houd de wijzigingen (zie "Gevolgen") in je achterhoofd, vooral dat organisaties niet meer verwijderd kunnen worden.

## 0. Back-up (Robin, vóór alles)

1. Supabase-dashboard → project `boxmdblzhuyfontwibdj` → **Database → Backups**. Noteer het tijdstip van de laatste back-up (en of point-in-time recovery aan staat). Is de laatste back-up ouder dan een dag: eerst uitzoeken, niet uitrollen.
2. Maak een eigen data-dump **buiten de repo**:

   ```bash
   mkdir -p ~/Backups
   cd ~/Code/klikklaar-sales-controlpanel/.superpowers/sdd/2026-11-03-meeting-voorstellen/push
   supabase db dump --linked --data-only -f ~/Backups/klikklaar-crm-2026-11-xx.sql
   ls -lh ~/Backups/klikklaar-crm-2026-11-xx.sql
   ```

   Vervang `xx` door de dag. Je ziet: een bestand van een paar MB of meer. **Dit bestand bevat persoonsgegevens** (klanten, contacten, notities): houd het privé, niet in de repo, niet in een gedeelde map, en verwijder het als het niet meer nodig is.

## 1. Branches samenvoegen (pas na OK van Robin)

Volgorde: eerst `feat/meeting-voorstellen`, daarna `feat/crm-fundament`, beide naar `main`.

```bash
cd ~/Code/klikklaar-sales-controlpanel
git checkout main && git pull
git merge feat/meeting-voorstellen
git merge feat/crm-fundament
```

Je ziet: twee merges zonder conflicten. Nog **niet** pushen naar `main`; dat komt in stap 6.

## 2. Push-map bouwen en dry-run

Kijk eerst wat remote al geregistreerd staat:

```bash
cd ~/Code/klikklaar-sales-controlpanel/.superpowers/sdd/2026-11-03-meeting-voorstellen/push
supabase migration list --linked | tail -8
```

Je ziet: als laatste regel `20261103000001` aan beide kanten (Local en Remote). Staat er remote iets nieuwers, of ontbreekt `20261103000001`: **stop** en laat het uitzoeken.

Patroon: `.superpowers/sdd/2026-11-03-meeting-voorstellen/push`. Die map bevat `supabase/config.toml`, `supabase/.temp` en alleen de migraties die al remote geregistreerd staan. Bouw een verse map:

```bash
cd ~/Code/klikklaar-sales-controlpanel
OLD=.superpowers/sdd/2026-11-03-meeting-voorstellen/push
NEW=.superpowers/sdd/2026-11-04-crm-fundament/push
rm -rf "$NEW" && mkdir -p "$NEW"
cp -R "$OLD/supabase" "$NEW/supabase"
# 20261103000001 is remote al toegepast; de vijf nieuwe erbij
cp supabase/migrations/20261103000001_*.sql "$NEW/supabase/migrations/"
cp supabase/migrations/2026110400000{1,2,3,4,5}_*.sql "$NEW/supabase/migrations/"
ls "$NEW/supabase/migrations" | tail -8
cd "$NEW" && supabase db push --linked --dry-run
```

Je ziet: de dry-run noemt **precies vijf** bestanden, `20261104000001` t/m `20261104000005`. Staat `20261103000001` of iets anders in de lijst, of mist er een: **stop** en laat het uitzoeken. Niet pushen.

## 3. Migraties toepassen (Robin)

Zelfde map, in je eigen terminal:

```bash
cd ~/Code/klikklaar-sales-controlpanel/.superpowers/sdd/2026-11-04-crm-fundament/push
supabase db push --linked
```

Plak de volledige uitvoer terug. Je ziet vijf keer "Applying migration ..." en `NOTICE`-regels. Lees die NOTICE's, ze zijn het rapport:

- Migratie 1: per organisatie hoe de stages als **gewonnen/verloren** zijn geclassificeerd, en welke stages **Gewonnen/Verloren** zijn toegevoegd.
- Migratie 1: deals in een gewonnen stage met `won_at` leeg, en deals in een verloren stage met `lost_at` leeg. Alleen gemeld, **nooit aangepast**. Zet de datum zo nodig later met de hand.
- Migratie 1: stages die op gewonnen/verloren **lijken** maar het niet precies zijn (bijv. "Deal gewonnen") en dus `open` bleven. Controleer of dat klopt; zo niet, zet het type later in de app.
- Migratie 1: deals waarvan de stage bij een **andere organisatie** hoort. Alleen gemeld; laat ze uitzoeken.
- Migratie 3: oude deals waarvan het contact bij een andere organisatie hoort. Die zijn **overgeslagen** (geen regel in `deal_contacts`, `deals.contact_id` blijft ongemoeid). Ze verschijnen niet in een weergave die alleen `deal_contacts` leest. Maak een lijstje van de deal-id's uit de NOTICE en herstel ze later met de hand.
- Migratie 5 stopt als de zes CRM-tabellen niet precies **24 policies** hebben. Dat is een bewuste veiligheidsstop. Migratie 5 is dan niet toegepast (1 t/m 4 wel, en dat is veilig). Laat het schema opnieuw dumpen en het aantal in de migratie aanpassen; daarna `supabase db push --linked` opnieuw, die past dan alleen 5 toe.

Controle achteraf:

```bash
supabase migration list --linked | tail -8
```

Je ziet: `20261104000001` t/m `05` aan beide kanten (Local en Remote).

## 4. Rechten controleren (SQL, in de Supabase SQL-editor)

Bestaande `user_organizations`-rijen met rol `admin` of `owner` worden **klant-admin** en mogen dus funnels configureren en items in de prullenbak definitief verwijderen. Dat geldt ook voor de oude demo-seed-gebruiker. Bekijk de lijst en haal weg wie het niet mag zijn:

```sql
select uo.organization_id, o.name, uo.user_id, u.email, uo.role
from public.user_organizations uo
join public.organizations o on o.id = uo.organization_id
left join auth.users u on u.id = uo.user_id
where uo.role in ('admin', 'owner')
order by o.name, uo.role;
```

Je ziet: een lijst van wie nu configuratierechten heeft. Klopt iemand niet, verlaag diens rol bij `user_organizations`.

Klantorganisaties markeren (`organizations.kind = 'client'`): er zijn er nog geen. Buitenbeleving komt in plan 5. Voorbeeld voor later:

```sql
update public.organizations set kind = 'client' where id = '<org-id>';
```

## 5. Edge functions uitrollen

Pas na een geslaagde push (de functies verwachten de nieuwe kolommen). **Doe stap 5 en 6 direct na elkaar**, zonder pauze ertussen (zie de waarschuwing onder stap 6).

```bash
cd ~/Code/klikklaar-sales-controlpanel
supabase functions deploy meeting-analyze --project-ref boxmdblzhuyfontwibdj
supabase functions deploy pipeline-summary --project-ref boxmdblzhuyfontwibdj
```

Je ziet: bij beide "Deployed Function ...".

`meeting-analyze` heeft Anthropic-tegoed nodig op het account waarvan de sleutel als `ANTHROPIC_API_KEY` staat. Zonder tegoed faalt de analyse. Die sleutel is eerder in een chat geplakt: **roteer hem** (nieuwe sleutel aanmaken, `supabase secrets set ANTHROPIC_API_KEY=... --project-ref boxmdblzhuyfontwibdj`, oude intrekken). Dat kan ook na de uitrol.

## 6. Frontend publiceren (direct na stap 5)

**Tussen de push (stap 3) en het publiceren van de nieuwe frontend: verwijder geen documenten bij bedrijven.** De oude frontend wist eerst het bestand uit de opslag en daarna de rij. Die rij gaat nu naar de prullenbak, maar het bestand is dan al weg; terugzetten geeft een document zonder bestand.

1. Controleer het juiste project:
   ```bash
   cd ~/Code/klikklaar-sales-controlpanel
   grep VITE_SUPABASE_PROJECT_ID .env
   ```
   Je ziet: `VITE_SUPABASE_PROJECT_ID="boxmdblzhuyfontwibdj"` (met aanhalingstekens). Iets anders: **niet pushen**.
2. Push `main` (alleen met OK van Robin): `git push origin main`.
3. Publiceer via Lovable (project `d32bf8e7-c4f0-46e8-b857-540e410dd58d`).
4. Controleer dat de live bundle het juiste project bevat:
   ```bash
   curl -s https://sales.klikklaarseo.nl | grep -o 'assets/index-[^"]*\.js' | head -1
   # plak de gevonden bestandsnaam hieronder
   curl -s https://sales.klikklaarseo.nl/assets/index-XXXX.js | grep -c boxmdblzhuyfontwibdj
   ```
   Je ziet: een getal van 1 of hoger.

## 7. Rooktest op productie

Log in op sales.klikklaarseo.nl en doe dit met een testbedrijf en testdeal:

1. Sleep de testdeal naar **Gewonnen**: `won_at` is gezet. Sleep terug: `won_at` is weer leeg.
2. Verwijder de deal, zie hem in **Prullenbak** (`/prullenbak`), herstel hem. Hij staat weer op het bord.
3. Verwijder een **stage waar een deal in de prullenbak staat**. Je ziet de foutmelding `Deze fase heeft nog deals (ook in de prullenbak)`. De stage blijft bestaan.
4. Voeg een notitie toe aan de testdeal, verwijder de notitie, verwijder daarna de deal. Zet in de prullenbak eerst de **notitie** terug. Je ziet `Dit item staat in de prullenbak` (de deal zelf ligt er nog in). Zet de deal terug, daarna de notitie: beide lukken.
5. Upload een testdocument bij het testbedrijf, verwijder het bedrijf. In de prullenbak staat het bedrijf met "samen met …". Kies (als org-admin) **Definitief verwijderen**: de dialoog toont `Dit verwijdert definitief: …` met de deals, contacten en documenten. Bevestig. Controleer in het dashboard (Storage → `company-documents` → map van de organisatie) dat het bestand weg is. Krijg je een melding dat bestanden niet uit de opslag zijn verwijderd: die staan in de melding, verwijder ze met de hand.
6. Laat opslaan mislukken (bijv. offline) en check dat de globale foutmelding (toast) verschijnt.
7. Ruim de testdeal en het testbedrijf op.

## Gevolgen om te weten

- **Organisaties kunnen niet meer worden verwijderd** (bewust, zodat data niet verdwijnt). Wil je ooit een organisatie weghalen, dan moet eerst de CRM-data expliciet worden gepurged.
- **Globale admins (`super_admin`/`admin`) kunnen nu de CRM-data van elke organisatie lezen en wijzigen.** Voorheen kon alleen wie lid was van de organisatie (`user_organizations`) erbij.
- **Een bedrijf verwijderen neemt nu zijn deals, contacten en afspraken mee** naar de prullenbak (voorheen bleven die los staan zonder bedrijf; alleen documenten en notities verdwenen). Terugzetten brengt alles terug. **Definitief verwijderen van het bedrijf verwijdert ze ook definitief**; de dialoog laat zien wat er meegaat.
- **Purge wist de wijzigingsgeschiedenis** (`crm_history`) en de bestanden van gepurgede documenten in `company-documents`. Kopieën in `crm_backup_20261104`, `audit_logs` en `meeting_proposals` (citaten) blijven staan. Bekend vervolgpunt. Bij een privacyverzoek (AVG) daar met de hand opschonen.
- Bestanden worden verwijderd met de rechten van wie purget. Een globale admin die geen lid is van de organisatie mag de map in de opslag niet wissen; de app meldt dan welke bestanden zijn blijven staan.
- Oude deals met een contact van een andere organisatie hebben geen `deal_contacts`-regel (zie stap 3).

## Terugdraaien en back-up

- **Frontend terugdraaien kan altijd los**: in Lovable naar de vorige versie. De oude frontend werkt op het nieuwe schema (let op de waarschuwing bij stap 6 over documenten).
- **De database gaat alleen vooruit.** Er zijn geen down-migraties. Een fout herstellen we met een nieuwe migratie, getest in de harness, en via dezelfde push-map.
- Bronnen voor herstel van data: het schema `crm_backup_20261104` (kopie van de CRM-tabellen van vóór migratie 1), je dump uit stap 0, en als laatste redmiddel de Supabase-back-up/PITR (die zet **alles** terug, ook ander werk van na dat moment). Verwijder `crm_backup_20261104` **pas nadat Robin akkoord is**, via een aparte latere migratie (niet met de hand).
- **Noodrem, alleen Robin of een Klikklaar-admin**: blokkeert een nieuwe trigger het werk en kan een fix-migratie niet wachten, zet dan alleen die ene trigger tijdelijk uit in de SQL-editor, en weer aan zodra de fix live staat:

  ```sql
  alter table public.deals disable trigger deals_sync_outcome;
  -- ... fix uitrollen ...
  alter table public.deals enable trigger deals_sync_outcome;
  ```

  Triggers van deze uitrol (tabel → naam):
  - `deals`: `deals_funnel_default`, `deals_stage_in_funnel`, `deals_sync_outcome`, `deals_sync_primary_contact`, `crm_trash_parent_guard`
  - `pipeline_stages`: `pipeline_stages_funnel_default`, `pipeline_stages_delete_guard`
  - `deal_activities`, `crm_appointments`, `company_items`: `crm_trash_parent_guard`
  - `deal_contacts`: `deal_contacts_before`, `deal_contacts_sync_deal`
  - `crm_fields`: `crm_fields_guard`; `funnels`: `funnels_seed_builtin_fields`
  - `crm_history` op `deals`, `companies`, `contacts`, `deal_activities`, `crm_appointments`, `deal_fees`, `deal_contacts`, `pipeline_stages`, `funnels`, `crm_fields`, `company_items` (uitzetten = geen geschiedenis in die periode)
  - **`crm_soft_delete` nooit uitzetten**: dan is verwijderen weer direct definitief, inclusief cascades.

  Noteer wanneer welke trigger uit stond; dat moet in de fix-migratie worden rechtgezet.

## Als het misgaat

- **Push stopt met een lock-timeout**: te druk. De migratie die stopte is teruggedraaid; eerdere migraties blijven staan (veilig). Wacht even en draai `supabase db push --linked` opnieuw; hij gaat verder waar hij stopte. Controleer met `supabase migration list --linked`.
- **Push stopt met een integriteitsfout** (of de 24-policies-check van migratie 5): alleen die migratie is teruggedraaid, de eerdere staan erin. Plak de melding en `supabase migration list --linked | tail -8`. Niet forceren, niet vanuit de repo-root pushen. Frontend en edge functions **niet** uitrollen tot alle vijf migraties erin staan.
- **Dry-run toont niet precies vijf bestanden**: stop, push-map opnieuw bouwen (stap 2).
- **Functie geeft fout na deploy**: controleer eerst of alle vijf migraties zijn toegepast (`supabase migration list --linked`) en of de Anthropic-sleutel/tegoed klopt.
- **Frontend toont een ander project**: terugdraaien in Lovable naar de vorige versie en `.env` controleren.
- **Data lijkt fout na de migratie**: niets verwijderen; vergelijk met `crm_backup_20261104` (en je dump uit stap 0) en laat de verschillen uitzoeken.
