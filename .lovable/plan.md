

# SE Dashboard Redesign — Action-First

Het huidige dashboard is een lange scroll van losse blokken (welkom, performance bars, Pipedrive widget, tips, EOD CTA, takenlijst, EOD historie, training, charts, chat). Te veel "informatie", te weinig "wat moet ik nu doen". We bouwen het om naar één **action-first** weergave waar bellen, opvolgen en de dagelijkse score centraal staan, en alles wat secundair is verschuift naar tabs of onderaan.

## Nieuwe structuur

```text
┌───────────────────────────────────────────────────────────┐
│ Welkom, Huub               Vandaag: 12/20 calls   [▶ Bel] │  ← compacte header met "Start belsessie" CTA
├───────────────────────────────────────────────────────────┤
│  NU DOEN  (3 grootste kaarten naast elkaar)               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ 🔥 Callbacks │ │ 🎯 Warme leads│ │ 📞 Open leads│       │
│  │      4       │ │      2        │ │     38       │       │
│  │ [Bel nu →]   │ │ [Bel nu →]    │ │ [Bel nu →]   │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
├───────────────────────────────────────────────────────────┤
│  JOUW LIJSTJE VANDAAG  (taken, klikbaar → DealDetailSheet)│
│  • Bel terug: Jansen BV         Hoog   →                  │
│  • Opvolgen: Pietersen          Hoog   →                  │
│  • Bel: De Vries Interieur      Med    →                  │
│  ...                                                       │
├───────────────────────────────────────────────────────────┤
│  VOORTGANG   [Vandaag | Week]                             │
│  Calls ▓▓▓▓▓▓▓░░ 12/20    Bereikt ▓▓▓▓░ 6/10             │
│  Positief ▓▓░ 2/3         (compacte bars, 1 rij)          │
├───────────────────────────────────────────────────────────┤
│  [Tabs]  Tips  |  Training  |  EOD historie  |  Charts    │
│  → alles wat nu onder de fold staat verhuist hierheen     │
├───────────────────────────────────────────────────────────┤
│  Sticky onderin (alleen na 16:00):  ✅ Sluit dag af (EOD) │
└───────────────────────────────────────────────────────────┘
```

## Wat verandert er concreet

**Bovenaan (boven de fold = pure actie)**
- Welkom-header wordt compact, krijgt rechts een live teller `12/20 calls vandaag` en een primaire knop **Start belsessie** (linkt naar `/calls`).
- Nieuwe **"Nu doen"** rij met 3 grote action-cards: *Callbacks vandaag*, *Warme leads (interesse, niet opgevolgd)*, *Open leads*. Elk toont een groot getal + één knop die direct de juiste filter opent (`/leads?filter=callback`, `?filter=interest`, `?filter=untouched`).
- Direct daaronder de **takenlijst** (huidige `SETaskChecklist`), maar uitgebreid naar 10 items en visueel groter — dit is het hart van de pagina.

**Midden (voortgang in 1 oogopslag)**
- `SEPerformanceBars` wordt platgeslagen tot **één rij** met een toggle Vandaag/Week (i.p.v. twee aparte cards naast elkaar). Minder ruimte, zelfde info.

**Onderaan (in tabs, niet meer als losse scroll-blokken)**
- Eén `Tabs` component met: **Tips** (`CICoachingCard`), **Training** (`SETrainingAdviceCard`), **EOD historie** (`SEEodHistory`), **Charts** (`DealValueChart` + `WeeklyActivitiesChart` + datumfilter).
- `PipedriveDashboardWidget` (alleen employees) verhuist naar de Charts-tab — het is referentie-info, geen actie.

**EOD CTA**
- `SEEndOfDayCTA` wordt een **sticky bar onderin** die alleen verschijnt vanaf 16:00 (i.p.v. een grote kaart midden in de pagina). Dismissable.

**CIChatCard** blijft floating zoals nu.

## Wat blijft hetzelfde (geen logica-wijziging — Visual Overhaul Policy)
- Alle data-fetches, signal-engine call, Pipedrive sync interval, polling-intervals, RLS-paden, klikgedrag van taken (opent `DealDetailSheet`).
- Componenten worden **hergebruikt** — alleen layout/positie/visuele groottes wijzigen, geen interne herschrijving van business-logic.

## Bestanden
- `src/pages/SEPersonalDashboard.tsx` — nieuwe layout (header + Nu doen rij + takenlijst + voortgang + tabs + sticky EOD).
- `src/components/dashboard/SEPerformanceBars.tsx` — variant met Vandaag/Week toggle in één card.
- `src/components/dashboard/SEEndOfDayCTA.tsx` — sticky-bar variant + tijdcheck (≥16:00).
- Nieuwe component `src/components/dashboard/QuickActionTiles.tsx` — de 3 "Nu doen" cards (callbacks / warme leads / open leads).

Geen DB-changes, geen nieuwe deps.

