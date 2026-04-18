

# SE Platform Verbeterplan — "Werkt sneller dan Excel"

## Context & probleem

Het team ervaart het platform nu als trager dan hun oude Excel-flow. De feedback gaat specifiek over **werksnelheid in de leadlijst tijdens belsessies** — niet over rapportage of dashboards. Alle 5 punten draaien om hetzelfde: SE's willen in één scherm, met sneltoetsen, een dagstack van leads doorlopen en duidelijk zien "wie heb ik gehad, wie nog niet, en wanneer terug".

Huidige reality (uit codebase):
- `SELeadsList` is de hoofd-werkplek voor SE's op `/leads`.
- Status komt uit `pipedrive_lead_assignments.status` (`assigned` | `in_progress` | `contacted` | `qualified` | …).
- Calls worden gelogd in `calls` met `outcome` (`not_reached`, `callback`, `no_interest`, `interest`, `appointment`, `deal`).
- Sidebar (`AppSidebar`, w-64) is altijd zichtbaar op desktop → geen collapse-knop → leadlijst scrolt horizontaal.
- Geen dag-target / activiteitentelling per SE op de leads-pagina zelf.
- "No answer 1/2/3" bestaat niet, alles wordt platgeslagen tot `not_reached`.

## De 5 punten + oplossing

### 1. Dagelijkse activiteitenlijst die je kunt afwerken
**Wat**: Bovenaan `/leads` een "Vandaag" balk: `12 / 25 calls · 3 / 5 callbacks · 1 / 2 afspraken`. Telt live mee bij elke gelogde call. Target komt uit `se_baselines` (al bestaande tabel, kolom `metric_name` + `baseline_value`). Progressbar wordt groen bij 100%.

**Hoe**: Nieuwe component `DailyActivityBar` boven `SELeadsList`. Query op `calls` van vandaag + join met `se_baselines` voor targets. Geen nieuwe tabel nodig.

### 2. Stadium / fase per lead — "wie heb ik gehad?"
**Wat**: Vervang de huidige enkele status-badge door een visuele **call-attempt indicator** per rij:
- ⚪⚪⚪ = nog niet gebeld
- 🟡⚪⚪ = 1× geen gehoor
- 🟡🟡⚪ = 2× geen gehoor  
- 🟡🟡🟡 = 3× geen gehoor (auto → "Cold")
- 🟢 = bereikt (met outcome-icoon: callback / interesse / afspraak / deal / geen interesse)

Plus kolom **"Laatste actie"** (bv. "Geen gehoor · 14:32" of "Callback ma 9:00"). Sortering & filter: "Nog niet gebeld vandaag" / "Mijn callbacks vandaag" / "2× geprobeerd" / "Klaar voor 3e poging".

**Hoe**: Bestaande `calls` tabel bevat alle attempts. Bereken per lead: `attempts_count`, `last_outcome`, `last_call_at`. Geen schemawijziging.

### 3. Sidebar collapse-knop → 1 scherm
**Wat**: Knop in de header (of `Cmd+B`) die de sidebar inschuift naar een smalle 56px icon-rail. Voorkeur opgeslagen in `localStorage` (`kk-sidebar-collapsed`). Op `/leads` standaard ingeklapt.

**Hoe**: `AppSidebar` krijgt `collapsed` prop. Width animeert van `w-64` → `w-14`. Labels verbergen, icons tonen tooltip. `AppLayout` regelt de toggle-state.

### 4. Sneltoetsen tijdens bellen
**Wat**: Vanuit de leadlijst direct met toetsenbord acties uitvoeren op de geselecteerde rij:

| Toets | Actie |
|---|---|
| `1` | Geen gehoor (auto-increment 1→2→3) |
| `2` | Callback inplannen (popover voor datum/tijd) |
| `3` | Interesse |
| `4` | Afspraak |
| `5` | Deal |
| `6` | Geen interesse |
| `M` | Mail sturen (mailto + log als activity) |
| `N` | Notitie toevoegen |
| `↓ ↑` | Volgende / vorige lead |
| `Enter` | Open detail |

**Speciaal**: Bij `1` (Geen gehoor) wordt automatisch een **callback gepland over 2 werkdagen** wanneer dit de 1e of 2e poging is. Bij de 3e poging wordt de lead gemarkeerd als "cold" (geen auto-callback meer; gaat naar lead-recycler na de bestaande regels).

**Hoe**: Keyboard handler in `SELeadsList`. Bestaande `calls` insert wordt hergebruikt — alleen nieuwe `outcome`-waarden toevoegen (zie punt 5). `addBusinessDays(today, 2)` voor callback.

### 5. Meerdere "geen gehoor" statussen (poging 1, 2, 3)
**Wat**: De SE wil zien dat een lead minimaal 3× geprobeerd is. We voegen geen 3 aparte outcomes toe — dat is rommelig — maar **tellen automatisch attempts**:

- Outcome blijft `not_reached`, maar de UI toont per lead "1/3", "2/3", "3/3" op basis van count van `not_reached` calls.
- Na 3× `not_reached` → lead krijgt status badge **"Cold (3× geen gehoor)"** en verschijnt in een aparte filter "Klaar voor recycling".
- De bestaande `lead-recycler` cron-flow blijft ongewijzigd.

**Hoe**: Pure UI-berekening uit `calls` tabel. Geen schemawijziging. Optioneel: `pipedrive_lead_assignments.status` automatisch op `cold` zetten na 3e attempt (kleine update in de bestaande mutation in `CallLoggingPage` / nieuwe inline-flow).

## Architectuur overzicht

```text
/leads (SELeadsList)
 ├── DailyActivityBar         [nieuw]  calls vandaag vs se_baselines
 ├── QuickFilters             [nieuw]  "Niet gebeld" | "Callbacks NU" | "2× geprobeerd" | "Cold"
 ├── LeadsTable               [refactor]
 │    ├── kolom: Attempt-dots (⚪⚪⚪ → 🟢)
 │    ├── kolom: Laatste actie + tijd
 │    ├── kolom: Volgende callback
 │    └── keyboard: 1-6, M, N, ↑↓, Enter
 └── InlineCallSheet          [bestaat]  hergebruik voor detail/notitie

AppLayout
 └── Sidebar collapse toggle  [nieuw]  Cmd+B / knop in header
```

## Wijzigingen per bestand

| Bestand | Wijziging |
|---|---|
| `src/components/layout/AppSidebar.tsx` | Accept `collapsed` prop, render mini-rail (w-14, icons + tooltip) bij collapsed |
| `src/components/layout/AppLayout.tsx` | Toggle-state + localStorage `kk-sidebar-collapsed`, header-knop, `Cmd+B` shortcut |
| `src/components/leads/SELeadsList.tsx` | Nieuwe kolommen (attempt-dots, laatste actie), keyboard handlers, quick filters, dag-target bar bovenaan |
| `src/components/leads/DailyActivityBar.tsx` | **Nieuw** — telt vandaag's calls per outcome vs `se_baselines` |
| `src/components/leads/AttemptIndicator.tsx` | **Nieuw** — toont ⚪⚪⚪ → 🟢 op basis van calls-count |
| `src/components/leads/QuickCallActions.tsx` | **Nieuw** — sneltoets-handler die `calls` inserts doet + callback +2 werkdagen plant |
| `src/pages/LeadManagementPage.tsx` | Hint-balk met sneltoetsen (`?` toont overlay) |

**Geen database migrations nodig.** Alle nieuwe gedrag komt uit bestaande tabellen (`calls`, `pipedrive_lead_assignments`, `se_baselines`). Constraint "Visual Overhaul Policy + bestaande business logic intact" wordt nageleefd.

## Open vraag voordat ik begin

Eén punt waar ik je input op wil voor ik bouw — het verschil bepaalt 30% van de UX-keuzes.

