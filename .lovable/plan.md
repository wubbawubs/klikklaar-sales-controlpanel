
# Styling Refresh, Tussenronde

Pure visuele opschoning, geen business logic verandert. Beide thema's (light + dark) worden in één klap aangescherpt. Scope blijft bewust klein zodat we snel kunnen schakelen.

## Wat er verandert

### 1. Topbar rechtsboven opruimen
- **Avatar/profielrondje weg** uit de topbar. Account, wachtwoord, profielfoto en uitloggen zijn al bereikbaar via de sidebar footer, dus dubbel.
- **Notificatiebel verhuist van sidebar naar topbar rechts**, op de plek waar nu de avatar zit. Logischer, altijd zichtbaar (ook als sidebar ingeklapt is), en geeft de donkere sidebar visueel rust.
- Topbar krijgt een subtiele bottom-border in plaats van de huidige harde lijn, en iets meer ademruimte (`h-14` consistent).
- `UserAccountMenu.tsx` wordt verwijderd uit `AppLayout.tsx` (component blijft bestaan voor evt. later, maar wordt niet meer gerenderd).

### 2. Sidebar polish
- Brand header: notificatiebel eruit, alleen logo + titels. Iets minder padding zodat het compacter oogt.
- Active nav-item: i.p.v. `bg-sidebar-primary/15` een nettere left-accent bar (2px teal links) + zachte achtergrond. Voelt meer als een echt admin platform (Linear/Vercel-stijl).
- Iconen krijgen consistente `h-[18px]` en `stroke-width=2`.
- User footer: avatar-bolletje strakker (kleur uit teal palette i.p.v. grijs), "Uitloggen" en thema-toggle als nette icon-buttons naast elkaar i.p.v. tekst-links.

### 3. Closer Kanban opfrissen
Dit is de pagina die je nu open hebt en die er volgens jou lelijk uit ziet.
- **Kolommen**: huidige `bg-muted/40` blokken worden vervangen door een lichtere card-style met subtiele border en gekleurde topbalk per status (2px streep in de status-tone). Geeft direct visuele scheiding tussen kolommen.
- **Kolomtitel**: kleine gekleurde dot + label in status-kleur, count-badge rechts in `bg-background` met border (i.p.v. solid pill).
- **Cards**: 
  - Iets meer padding (`p-3.5`), `rounded-xl`, zachte shadow op hover i.p.v. alleen border-color change.
  - Org-naam grotere weight, contact eronder als secundaire regel.
  - Datum/tijd icoontjes in `text-muted-foreground/70`.
  - Deal-bedrag krijgt een eigen pill rechts onderin i.p.v. losse groene tekst.
  - Stale-badge (`2d`, `5d`) blijft, maar in nieuwe stijl (rounded-md, kleinere padding, consistent met andere badges).
  - "Bel" en "Mail" worden echte mini-buttons met border i.p.v. tekstlinks.
- **Lege kolom**: gestreepte placeholder met icon i.p.v. cursief "Leeg".
- **Drag state**: kolom krijgt `bg-primary/5` + `ring-1 ring-primary/20`, card krijgt `shadow-elevated` + lichte schaal i.p.v. rotate (rotate voelt speels, te casual).

### 4. Page header op /closer
- Huidige header (icon-tegel + titel) wordt strakker: kleinere icon-tegel, titel `text-page` (al gedefinieerd in tailwind config), subtitel `text-sm text-muted-foreground`. Rechts ernaast komt een count "X afspraken in pipeline".

### 5. Light + Dark theme finetuning in `index.css`
Minimale tweaks aan de design tokens, geen kleurenrevolutie:
- **Light**: `--background` iets warmer/witter (`210 20% 98%`), `--card` blijft puur wit, `--border` iets zachter (`220 13% 92%`). Geeft minder grijs-op-grijs gevoel.
- **Dark**: `--background` iets dieper (`220 22% 8%`), `--card` (`220 20% 12%`), `--muted` (`220 16% 14%`). Hogere contrast tussen card en achtergrond zodat kanban-kolommen pop'en.
- Sidebar tokens blijven gelijk (navy is on-brand).
- Shadow tokens al goed in tailwind config, hergebruiken.

### 6. Quick wins overal
- Cards in app gebruiken consistent `shadow-card` op rust en `shadow-card-hover` op hover (al gedefinieerd, alleen toepassen waar nu niks staat).
- `animate-fade-in` op kanban kolommen zodat het bij refresh iets minder stilstaat.

## Wat NIET verandert
- Geen wijzigingen in routes, auth, data-fetching, drag-and-drop logica, notificatie-functionaliteit zelf, of email/cron flows.
- `UserAccountMenu` component wordt niet verwijderd, alleen niet meer gerenderd in topbar.
- Geen nieuwe pagina's of features.

## Bestanden die worden aangepast
- `src/components/layout/AppLayout.tsx` — avatar weg, topbar netter
- `src/components/layout/AppSidebar.tsx` — bel naar topbar, active state strakker, footer polish
- `src/components/closer/CloserKanban.tsx` — kolomstijl, drag state, lege state
- `src/components/closer/AppointmentCard.tsx` — card refresh
- `src/pages/CloserCRMPage.tsx` — header polish + count
- `src/index.css` — light/dark token tweaks
- (optioneel) `src/components/pwa/NotificationBell.tsx` — alleen kleurklassen aanpassen zodat hij goed staat op licht én donker (nu is hij gestyled voor donkere sidebar)

## Vervolg (later, niet nu)
- Dezelfde polish toepassen op `/leads`, `/dashboard`, `/evaluaties` zodra je akkoord bent met de richting hier op `/closer`.

---

# Funnel Tracking & Forecasting Engine (Plan)

Doel: één gesloten meetsysteem van cold dial tot close, zodat we per stage conversies meten, targets bewaken, en MRR kunnen forecasten op basis van capaciteit (cold callers, closers).

Status: **plan only**, nog geen code wijzigingen. We bouwen pas na akkoord per fase.

## Bron MIRO (door gebruiker gedeeld)

**Cold call funnel (SE domein)**
- Funnel: Leadlijst, Pre-check (2 verbeterpunten), Cold call, Afspraak boeken, Bevestigingscall, Reminder flow, Show-up
- Conversies: Dials, Gesprek (35%), Afspraak (25%), Show-up (90%)

**Close funnels (Closer domein)** — vijf varianten:
- Follow-up funnel: Call booked, Sales call 1 (92%), Follow up (80%), Deal (75%)
- 1-call-close funnel: Call booked, Sales call 1 (92%), Deal (75%)
- Lost funnel
- Mail funnel: Call booked, Sales call 1 (92%), Deal (75%)
- Re-engage funnel: Call booked, Sales call 1 (92%), Deal (75%)

## Fase 1 | Foundation: uniform funnel_events model

Eén tabel die alle stage-overgangen vastlegt, ongeacht of het een cold-call event is of een close-event. Dit is de single source of truth voor conversies.

**Nieuwe tabel: `funnel_events`**
- `id` uuid
- `event_at` timestamptz (wanneer de stage bereikt is)
- `funnel_type` text — `cold_call` | `follow_up_close` | `one_call_close` | `lost` | `mail_close` | `reengage_close`
- `stage` text — bv. `dial`, `conversation`, `appointment_booked`, `confirmation_call`, `reminder_sent`, `show_up`, `sales_call_1`, `follow_up`, `deal_won`, `deal_lost`
- `lead_assignment_id` uuid nullable — koppeling naar pipedrive_lead_assignments
- `closer_appointment_id` uuid nullable — koppeling naar closer_appointments
- `sales_executive_id` uuid nullable — wie het event triggerde (caller)
- `closer_user_id` uuid nullable — wie het event triggerde (closer)
- `value_eur` numeric nullable — bij deal stages
- `source_table` text — waar het event vandaan komt (`calls`, `closer_appointments`, `manual`)
- `source_id` uuid nullable — id in source tabel, voor idempotency
- `metadata_json` jsonb

**Unieke index** op `(source_table, source_id, stage)` zodat triggers idempotent zijn.

**Hoe vullen we het (BESLIST: geen backfill, alleen vooruit):**
1. **Geen backfill.** Oude data is verwaarloosbaar. We starten meten vanaf go-live van de migratie. Dashboards tonen daarom de eerste weken "data wordt opgebouwd" tot er voldoende events zijn.
2. **Live triggers** vanaf go-live:
   - DB trigger op `calls` insert → funnel_events insert (`dial`, en `conversation` bij outcome=reached, `appointment_booked` bij outcome=appointment)
   - DB trigger op `closer_appointments` status change → funnel_events insert (`sales_call_1`, `follow_up`, `deal_won`, `deal_lost`)
3. **Show-up = handmatige knop** in Closer UI (BESLIST). Closer drukt "Show-up bevestigd" zodra het gesprek daadwerkelijk start. Verantwoordelijkheid bij de closer, geen auto-afleiding. Knop voegt `funnel_events` row toe met `stage='show_up'`, `source_table='manual'`, idempotent per `closer_appointment_id`.
4. **Pre-check / Bevestigingscall / Reminder flow:** out of scope (BESLIST). Niet meten in v1. Kan later toegevoegd worden zodra die acties ergens gelogd worden.

**RLS:** zelfde patroon als `calls`. Admin = alles, Coach = eigen SEs, SE = eigen events, Closer = eigen events.

## Fase 2 | Targets beheerbaar in Settings

**Nieuwe tabel: `funnel_targets`**
- `id` uuid
- `funnel_type` text
- `from_stage` text
- `to_stage` text
- `target_pct` numeric (0-100)
- `scope` text — `team` | `se` | `closer`
- `scope_user_id` uuid nullable (alleen bij scope se/closer)
- `effective_from` date
- `created_by`, `updated_at`

**Seed waarden (uit jouw MIRO):**
- cold_call | dial → conversation | 35
- cold_call | conversation → appointment_booked | 25
- cold_call | appointment_booked → show_up | 90
- follow_up_close | call_booked → sales_call_1 | 92
- follow_up_close | sales_call_1 → follow_up | 80
- follow_up_close | follow_up → deal_won | 75
- one_call_close | call_booked → sales_call_1 | 92
- one_call_close | sales_call_1 → deal_won | 75
- mail_close, reengage_close: idem 92 / 75

**Admin UI:** nieuwe tab in Settings → "Funnel targets". Tabel met inline editing per rij, toevoegen/verwijderen, scope kiezer (team default, optioneel per persoon override).

## Fase 3 | Dashboard widgets (read-only op funnel_events)

Drie nieuwe widgets, allemaal read-only op `funnel_events` + `funnel_targets`:

**A. Conversie matrix per funnel**
- Per funnel_type een rij met alle stages
- Toont: actuele conversie %, target %, delta, kleur (groen ≥ target, geel binnen 10%, rood eronder)
- Drill-down: klik op stage → lijst events in periode

**B. MIRO-style funnel diagram (live)**
- React Flow / svg rendering van jouw exacte MIRO layout
- Per node de actuele count + conversie naar volgende node
- Toggle: absoluut (#) of relatief (%)
- Geeft het "alle inzicht in één blik" gevoel dat je beschrijft

**C. Funnel performance per persoon**
- Sortable tabel SEs (cold_call funnel) en Closers (close funnels)
- Per persoon eigen conversie per stage vs team gemiddelde

Vervangt de huidige `ConversionFunnel.tsx` (die is hard-coded op pipedrive_lead_assignments status, te beperkt).

## Fase 4 | Forecasting & capacity planner

**Twee modi in nieuwe pagina `/forecasting` (alleen toegankelijk voor `super_admin`, in UI gelabeld als "Director"):**

> **Rol-label rename (BESLIST):** in de UI hernoemen we de zichtbare naam van de `super_admin` rol naar **Director**. De DB enum-waarde `super_admin` blijft ongewijzigd (geen migratie van `app_role`), alleen de display label in sidebar/badges/menu's verandert. Dit voorkomt risico op RLS/policy breakage.

**Modus 1: Reverse forecast (MRR doel → benodigde capaciteit)**
- Input: gewenste nieuwe MRR per kwartaal (bv. 10k), gemiddelde deal value, kwartaal lengte
- Berekening: gebruik live conversies × targets om backwards te rekenen:
  - Deals nodig = MRR_doel / avg_deal_value
  - Show-ups nodig = Deals / (sales_call_1 → deal conv)
  - Afspraken nodig = Show-ups / show_up_conv
  - Gesprekken nodig = Afspraken / appointment_conv
  - Dials nodig = Gesprekken / conversation_conv
- Capaciteit: dials per dag per SE (uit baseline) → benodigde FTE callers
- Closer capaciteit: max afspraken per closer per week (configurable) → benodigde closers
- Output: tabel "Voor 10k MRR per kwartaal: X dials, Y gesprekken, Z afspraken, A SEs, B closers"

**Modus 2: Forward forecast (capaciteit → verwachte uitkomst)**
- Input: # cold callers, # closers
- Output: verwachte dials, gesprekken, afspraken, deals, MRR per maand/kwartaal
- "Wat-als" sliders: pas conversies aan, zie impact op MRR direct

**Datasources:**
- Conversies: live uit `funnel_events` over rolling 30/60/90 dagen
- SE baseline (dials/dag): uit bestaande `se_baselines`
- Closer capaciteit (afspraken/week): nieuwe setting in `settings` tabel

**Configurables (Settings → Forecasting), allen één waarde (BESLIST):**
- Default deal value (€) — **één gemiddelde**, niet per product_line
- Werkdagen per maand
- Closer max afspraken/week
- Conversie bron: live data, target waarden, of blend

## Beslissingen (vastgelegd)

1. ✅ **Backfill scope**: geen backfill, alleen vooruit meten vanaf go-live.
2. ✅ **Show-up detectie**: handmatige knop in Closer UI. Verantwoordelijkheid bij closer.
3. ✅ **Pre-check / Bevestiging / Reminder stages**: out of scope voor v1.
4. ✅ **Forecasting deal value**: één gemiddelde, configureerbaar in Settings.
5. ✅ **Toegang `/forecasting`**: alleen `super_admin` (UI-label = "Director").

## Volgorde van bouwen

1. **Fase 1 migratie**: `funnel_events` tabel + RLS + triggers op `calls` en `closer_appointments`. Geen backfill script nodig. Veilig: alleen nieuwe tabel.
2. **Fase 1 UI-uitbreiding**: "Show-up bevestigd" knop op closer appointment detail (idempotent insert in funnel_events).
3. **Fase 2 migratie + UI**: `funnel_targets` tabel + Settings tab met seed waarden uit MIRO.
4. **Fase 3 widgets**: A (matrix) en C (per persoon) eerst, B (MIRO viz) later.
5. **Director rol-label**: kleine UI sweep om "Super Admin" → "Director" te hernoemen in sidebar/menu's. DB blijft `super_admin`.
6. **Fase 4**: `/forecasting` pagina, beschermd met `allowedRoles=['super_admin']`.

