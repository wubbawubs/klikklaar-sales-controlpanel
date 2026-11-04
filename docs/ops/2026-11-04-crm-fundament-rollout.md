# CRM-fundament: uitrol naar productie (4 nov 2026)

Voor Robin en wie de uitrol met hem doet. Productie-project: `boxmdblzhuyfontwibdj`.
Claude mag in auto-modus niet naar productie pushen. Robin draait de `push`- en `deploy`-commando's zelf in zijn eigen terminal (zonder `!`-prefix) en plakt de uitvoer terug.

Wat er live gaat: vijf migraties (`20261104000001` t/m `05`), twee edge functions (`meeting-analyze`, `pipeline-summary`) en de frontend (stage-types, `/prullenbak`, foutmelding bij mislukt opslaan).

## Voor je begint (lees dit eerst)

- **Nooit `supabase db push` vanuit de repo-root.** De remote migratiegeschiedenis stopt bij `20260610000004`; veel latere migraties zijn met de hand toegepast. Een push vanuit de root zou die opnieuw proberen toe te passen. Gebruik altijd de aparte push-map uit stap 2.
- **Push op een rustig moment.** Migratie 1 neemt een paar seconden een `ACCESS EXCLUSIVE`-lock op `deals`, `pipeline_stages` en `organizations`. Is het druk, dan stopt `lock_timeout` (5s) netjes zonder wijzigingen. Gewoon opnieuw proberen.
- Elke migratie controleert zichzelf. Bij elke afwijking in de data-integriteit stopt hij **zonder wijzigingen**.
- Houd de wijzigingen (zie "Gevolgen") in je achterhoofd, vooral dat organisaties niet meer verwijderd kunnen worden.

## 1. Branches samenvoegen (pas na OK van Robin)

Volgorde: eerst `feat/meeting-voorstellen`, daarna `feat/crm-fundament`, beide naar `main`.

```bash
cd ~/Code/klikklaar-sales-controlpanel
git checkout main && git pull
git merge feat/meeting-voorstellen
git merge feat/crm-fundament
```

Je ziet: twee merges zonder conflicten. Nog **niet** pushen naar `main`; dat komt in stap 5.

## 2. Push-map bouwen en dry-run

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
- Migratie 1: deals in een gewonnen stage met `won_at` leeg (NULL). Alleen gemeld, **nooit aangepast**. Zet de datum zo nodig later met de hand.
- Migratie 3: oude deals waarvan het contact bij een andere organisatie hoort. Die zijn **overgeslagen** (geen regel in `deal_contacts`, `deals.contact_id` blijft ongemoeid). Ze verschijnen niet in een weergave die alleen `deal_contacts` leest. Maak een lijstje van de deal-id's uit de NOTICE en herstel ze later met de hand.
- Migratie 5 stopt als de zes CRM-tabellen niet precies **24 policies** hebben. Dat is een bewuste veiligheidsstop. Laat het schema opnieuw dumpen en het aantal in de migratie aanpassen; de push is dan niet toegepast.

Controle achteraf:

```bash
supabase migration list --linked | tail -8
```

Je ziet: `20261104000001` t/m `05` aan beide kanten (Local en Remote).

## 4. Rechten controleren (SQL, in de Supabase SQL-editor)

Bestaande `user_organizations`-rijen met rol `admin` of `owner` worden **klant-admin** en mogen dus funnels configureren. Dat geldt ook voor de oude demo-seed-gebruiker. Bekijk de lijst en haal weg wie het niet mag zijn:

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

Pas na een geslaagde push (de functies verwachten de nieuwe kolommen):

```bash
cd ~/Code/klikklaar-sales-controlpanel
supabase functions deploy meeting-analyze --project-ref boxmdblzhuyfontwibdj
supabase functions deploy pipeline-summary --project-ref boxmdblzhuyfontwibdj
```

Je ziet: bij beide "Deployed Function ...".

`meeting-analyze` heeft Anthropic-tegoed nodig op het account waarvan de sleutel als `ANTHROPIC_API_KEY` staat. Zonder tegoed faalt de analyse. Die sleutel is eerder in een chat geplakt: **roteer hem** (nieuwe sleutel aanmaken, `supabase secrets set ANTHROPIC_API_KEY=... --project-ref boxmdblzhuyfontwibdj`, oude intrekken).

## 6. Frontend publiceren

1. Controleer het juiste project:
   ```bash
   cd ~/Code/klikklaar-sales-controlpanel
   grep VITE_SUPABASE_PROJECT_ID .env
   ```
   Je ziet: `VITE_SUPABASE_PROJECT_ID=boxmdblzhuyfontwibdj`. Iets anders: **niet pushen**.
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

Log in op sales.klikklaarseo.nl en doe dit met een testdeal:

1. Sleep de testdeal naar **Gewonnen**: `won_at` is gezet. Sleep terug: `won_at` is weer leeg.
2. Verwijder de deal, zie hem in **Prullenbak** (`/prullenbak`), herstel hem. Hij staat weer op het bord.
3. Verwijder een **stage waar een deal in de prullenbak staat**: je ziet de Nederlandse foutmelding dat de stage nog gekoppelde (verwijderde) deals heeft. De stage blijft bestaan.
4. Laat opslaan mislukken (bijv. offline) en check dat de globale foutmelding (toast) verschijnt.
5. Ruim de testdeal op.

## Gevolgen om te weten

- **Organisaties kunnen niet meer worden verwijderd** (bewust, zodat data niet verdwijnt). Wil je ooit een organisatie weghalen, dan moet eerst de CRM-data expliciet worden gepurged.
- **Purge wist alleen de wijzigingsgeschiedenis** (`crm_history`). Kopieën in `crm_backup_20261104`, `audit_logs` en `meeting_proposals` (citaten), plus bestanden in de storage-bucket `company-documents` van gepurgede documenten, blijven staan. Bekende vervolgpunten. Bij een privacyverzoek (AVG) daar met de hand opschonen.
- Oude deals met een contact van een andere organisatie hebben geen `deal_contacts`-regel (zie stap 3).

## Terugdraaien en back-up

Het schema `crm_backup_20261104` bevat de kopie van de data van vóór de migraties. Verwijder het **pas nadat Robin akkoord is**, via een aparte latere migratie (niet met de hand). Tot die tijd is het ook de bron voor herstel.

## Als het misgaat

- **Push stopt met een lock-timeout**: te druk. Wacht even en draai `supabase db push --linked` opnieuw. Er is niets gewijzigd.
- **Push stopt met een integriteitsfout** (of de 24-policies-check van migratie 5): er is niets toegepast. Plak de melding, niet forceren, niet vanuit de repo-root pushen.
- **Dry-run toont niet precies vijf bestanden**: stop, push-map opnieuw bouwen (stap 2).
- **Functie geeft fout na deploy**: controleer eerst of alle vijf migraties zijn toegepast (`supabase migration list --linked`) en of de Anthropic-sleutel/tegoed klopt.
- **Frontend toont een ander project**: terugdraaien in Lovable naar de vorige versie en `.env` controleren.
- **Data lijkt fout na de migratie**: niets verwijderen; vergelijk met `crm_backup_20261104` en laat de verschillen uitzoeken.
