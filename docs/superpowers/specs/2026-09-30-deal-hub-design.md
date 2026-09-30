# Deal Hub — design

**Datum:** 2026-09-30
**Aanvraag:** Juliëtte (COO OTR) via Luuk — "apart stuk voor bedrijfsinformatie/sales-voorbereiding bij deals" + "koppeling met agenda, keuze call/meeting". Uitgebreid door Luuk naar: deal-detail "zoals HubSpot" + werknemers alleen CRM-toegang.
**App:** sales.klikklaarseo.nl (`klikklaar-sales-controlpanel`, Supabase `boxmdblzhuyfontwibdj`).

## Doel

Een deal openen geeft één plek met alles wat sales nodig heeft: bedrijfsgegevens, voorbereiding en intake (notities + documenten), tarieven, tijdlijn en geplande calls/meetings. Werknemers krijgen toegang tot het CRM zonder finance te zien.

**Succes:**
- Juliëtte kan bij een deal een salesvoorbereiding schrijven, later een intake-document uploaden, en ziet die bij elke deal van hetzelfde bedrijf terug.
- Vanuit een deal plant ze een call of meeting en zet die met één klik in Outlook.
- Een medewerker met rol `sales_executive`/`closer`/`coach` kan finance-data niet zien — niet in de UI en niet via de database-API.

## Scope

**In:** deal-popup (breed, HubSpot-indeling), `company_items` (notities + documenten op bedrijfsniveau), `crm_appointments` + Agenda-pagina + .ics-export, finance/groeidoelen admin-only (UI + RLS + edge functions).

**Uit (later/apart):** echte Outlook/Microsoft 365-sync (stap 2 — bouwt op `crm_appointments.external_id`), e-mailherinneringen, terugkerende afspraken, weekrooster-weergave, nieuwe bedrijfsvelden (KvK/LinkedIn) tenzij Juliëtte die vraagt.

## Besluiten (met Luuk afgestemd)

1. Deal opent als **brede popup** (~90vw × 90vh) over de pipeline, niet als aparte pagina.
2. Voorbereiding/intake hangt aan het **bedrijf** (zoals HubSpot), zichtbaar in elke deal van dat bedrijf. Tijdlijn blijft per deal, met schakelaar "hele bedrijf".
3. Finance + Groeidoelen: **alleen admin/super_admin**. Dealwaarde + tarieven (`deal_fees`): zichtbaar voor alle CRM-leden. Dashboard blijft open (gebruikt alleen deals/contacten).
4. Agenda stap 1 = in het CRM + .ics "Toevoegen aan Outlook". Outlook-sync = apart vervolgproject.

## 1. Deal-popup

Vervangt `DealDialogBody` in `src/pages/PipelinePage.tsx`. Nieuwe componenten in `src/components/deal/` zodat PipelinePage niet verder groeit:

- `DealHubDialog.tsx` — shell: header + drie kolommen.
- `CompanyPanel.tsx` — linkerkolom.
- `DealOverviewTab.tsx` — huidige bewerkvelden (titel, stage, bedrijf, tarieven, verwijderen) verplaatst.
- `PrepIntakeTab.tsx` — voorbereiding & intake.
- `ActivityTab.tsx` — huidige `ActivityFeed` verplaatst + afspraken + bedrijfsfilter.
- `AppointmentsPanel.tsx` — rechterkolom.
- `AppointmentDialog.tsx` — plannen/verzetten (hergebruikt op Agenda-pagina).

**Header:** dealtitel, stage-select (snel wisselen), bedragsamenvatting via bestaande `formatFee()`, eigenaar, knoppen *Call plannen*, *Meeting plannen*, verwijderen, sluiten.

**Linkerkolom (CompanyPanel):**
- Bedrijfskaart: naam, website (klikbaar), branche, plaats, telefoon, e-mail. ✎ zet de kaart in bewerkmodus → opslaan update `companies`.
- Contactpersoon van de deal (`contacts`): naam, functie, telefoon, e-mail; ✎ bewerkbaar.
- "Andere deals": overige deals met hetzelfde `company_id`, klik opent die deal in dezelfde popup.
- Geen bedrijf gekoppeld → kaart toont "Koppel een bedrijf" (select bestaand / nieuw aanmaken).

**Tabbladen:**
- *Overzicht* — bestaande velden + Opslaan (gedrag ongewijzigd).
- *Voorbereiding & intake* — lijst `company_items` van het bedrijf, gegroepeerd per categorie (Voorbereiding, Intake, Overig), nieuwste eerst. Leeg → alleen knop "+ Voorbereiding of intake toevoegen". Toevoegen: keuze *Notitie* (categorie, titel, grote textarea) of *Document* (categorie, drag-and-drop/bestandskiezer, max 20 MB). Notities bewerkbaar/verwijderbaar; documenten openen via signed URL, verwijderbaar. Zonder gekoppeld bedrijf: melding "Koppel eerst een bedrijf".
- *Activiteit* — toevoegen zoals nu; tijdlijn met `deal_activities` + `crm_appointments`. Schakelaar *Deze deal / Hele bedrijf* (bedrijf = activiteiten van alle deals met dat `company_id`).

**Rechterkolom:** komende afspraken van deze deal (status `planned`) met acties *Outlook (.ics)*, *Afronden*, *Verzetten*, *Annuleren*. Leeg → "Geen geplande afspraken".

**Responsive:** < lg: kolommen onder elkaar (bedrijf → tabs → agenda), popup full-screen op mobiel.

## 2. Datamodel

Migratie `supabase/migrations/20260930000001_deal_hub.sql`, idempotent.

### `company_items`
```sql
id uuid pk default gen_random_uuid(),
org_id uuid not null references organizations(id) on delete cascade,
company_id uuid not null references companies(id) on delete cascade,
item_type text not null check (item_type in ('note','document')),
category text not null default 'preparation' check (category in ('preparation','intake','other')),
title text,
body text,                 -- note
file_name text,            -- document
storage_path text,         -- document: '{org_id}/{company_id}/{uuid}-{file_name}'
mime_type text,
size_bytes bigint,
created_by uuid references auth.users(id),
created_at timestamptz default now(),
updated_at timestamptz default now()
```
Index op `(company_id, created_at desc)`. RLS: org-lidmaatschap (zelfde patroon als `deals`). Trigger `update_updated_at_column`.

### Storage bucket `company-documents`
Privé (`public = false`). Policies op `storage.objects` voor select/insert/delete: `bucket_id = 'company-documents'` en eerste padsegment (`(storage.foldername(name))[1]::uuid`) in de org-ids van de gebruiker. Openen via `createSignedUrl` (60 s).

### `crm_appointments`
```sql
id uuid pk default gen_random_uuid(),
org_id uuid not null references organizations(id) on delete cascade,
deal_id uuid references deals(id) on delete cascade,
company_id uuid references companies(id) on delete set null,
contact_id uuid references contacts(id) on delete set null,
owner_id uuid not null references auth.users(id),
type text not null check (type in ('call','meeting')),
title text not null,
starts_at timestamptz not null,
duration_min int not null default 30,
location text,             -- adres of video-link
notes text,
status text not null default 'planned' check (status in ('planned','done','cancelled','no_show')),
outcome text,
external_id text,          -- gereserveerd voor Outlook-sync (stap 2)
created_by uuid references auth.users(id),
created_at timestamptz default now(),
updated_at timestamptz default now()
```
Indexen op `(org_id, starts_at)`, `(owner_id, starts_at)`, `(deal_id)`. RLS: org-lidmaatschap. Naam bewust niet `appointments` (legacy `closer_appointments` bestaat en blijft ongemoeid).

**Afronden** zet `status='done'` + `outcome`, en schrijft een `deal_activities`-regel (`type` = call/meeting, `body` = outcome, `meta.appointment_id`).

## 3. Toegang (finance admin-only)

```sql
create or replace function public.can_view_finance(_uid uuid) returns boolean
  language sql stable security definer set search_path = public
  as $$ select public.is_admin(_uid) $$;
```
Policies vervangen (drop + create) op: `invoices`, `cash_positions`, `company_financials`, `contracts`, `bunq_state`, `growth_goals` → `USING/WITH CHECK (public.can_view_finance(auth.uid()))`. De exacte bestaande policies worden in de plan-fase per tabel uitgelezen. `deal_fees` blijft org-scoped.

**Frontend:**
- `AppSidebar`: Finance en Groeidoelen krijgen `adminOnly: true`.
- `App.tsx`: `/finance/*` en `/growth` in `<ProtectedRoute allowedRoles={['super_admin','admin']}>`.

**Edge functions:** `stripe-summary` en `bunq-sync` controleren op admin (via `is_admin` met de JWT van de caller); ontbreekt dat → 403 toevoegen. Cron/service-role-aanroepen blijven werken.

**Uitrol-voorwaarde:** vóór het toepassen van de RLS-wijziging wordt de lijst gebruikers + rollen opgehaald en aan Luuk voorgelegd; wie finance moet houden (vermoedelijk Juliëtte, Robin) wordt eerst admin gemaakt.

## 4. Agenda

- **`AppointmentDialog`**: type (call/meeting), titel (default "Call met {contact}" / "Meeting met {bedrijf}"), datum, tijd, duur (15/30/45/60/90), locatie/link (alleen meeting), notitie, eigenaar (default = ingelogde gebruiker). Deal/bedrijf/contact voorgevuld vanuit de popup.
- **.ics-export**: `src/lib/ics.ts` genereert een VCALENDAR/VEVENT (UID = appointment id, DTSTART/DTEND in UTC, SUMMARY, DESCRIPTION met deal-link, LOCATION, ATTENDEE = contact-email indien aanwezig, ORGANIZER = eigenaar). Download als `{titel}.ics`; Outlook opent het direct.
- **Agenda-pagina** (`src/pages/AgendaPage.tsx`, route `/agenda`, nav-item voor iedereen): lijst gegroepeerd *Achterstallig* (planned en voorbij), *Vandaag*, *Deze week*, *Later*. Filters: Mijn / Iedereen (Iedereen = alle afspraken in het huidige CRM), Call / Meeting / Alles. Klik → opent de dealpopup.
- **Pipeline-kaart**: klein badge met eerstvolgende afspraak ("📞 do 10:00") indien aanwezig.

## Foutafhandeling

- Uploads: >20 MB of mislukte upload → toast, geen `company_items`-rij. Bij insert-fout na geslaagde upload: object weer verwijderen.
- Document verwijderen: eerst storage-object, dan rij; mislukt storage → rij blijft, toast.
- Afspraak in het verleden plannen: toegestaan (loggen achteraf), met waarschuwing.
- Geen gekoppeld bedrijf: Voorbereiding-tab en bedrijfsfilter uitgeschakeld met uitleg.
- Tijdzones: opslaan in UTC, tonen in `Europe/Amsterdam` via `toLocaleString('nl')`.

## Testen

- Unit (vitest): `ics.ts` (escaping, UTC-tijden, attendee optioneel), agenda-groepering (achterstallig/vandaag/week/later rond middernacht en weekgrens).
- RLS-verificatie na migratie: als niet-admin testgebruiker `select` op `invoices`/`cash_positions`/`growth_goals` → 0 rijen; op `deals`/`deal_fees`/`company_items`/`crm_appointments` → wel data; storage signed URL van ander org → geweigerd.
- Handmatig in preview: deal openen, bedrijf bewerken, notitie + document toevoegen en in tweede deal van hetzelfde bedrijf terugzien, call plannen, .ics openen in Outlook, afronden → tijdlijn, Agenda-pagina, mobiele weergave, niet-admin ziet geen Finance/Groeidoelen.

## Uitrol-aandachtspunten

- Migratie toepassen via de bekende eenmalige token-gated edge function (geen DB-wachtwoord); migratiebestand committen voor parity.
- **Vóór push:** `git show origin/main:.env | grep PROJECT_ID` moet `boxmdblzhuyfontwibdj` zijn (Lovable heeft `.env` eerder omgezet). Na deploy: live bundle controleren op juiste Supabase-ref; publiceren via Lovable `deploy_project` (project `d32bf8e7-c4f0-46e8-b857-540e410dd58d`).
- RLS-deel pas live na akkoord op de rollenlijst (zie §3).
