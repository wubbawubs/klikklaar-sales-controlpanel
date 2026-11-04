# CRM Design Shell, Board, List and Deal Panel Implementation Plan (plan 2 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CRM look and work like the chosen "Glass A, daylight" design. That means funnel-aware board, list and deal screens that show and edit each funnel's own fields: range, win chance, country, priority, custom fields and so on.

**Architecture:**
- **Visual style.** One token layer (CSS variables plus a few glass utilities) and a runtime org accent colour taken from `organizations.primary_color_hex`. The shadcn primitives are restyled once, so every page inherits the new look.
- **Data logic.** All field logic lives in a pure, tested module, `src/lib/dealFields.ts`, covering formatting, totals, weighted value and reading/writing built-in versus custom values. The board, list and deal panel only render what that module and the funnel's `crm_fields` rows say.
- **No database changes.** Plan 1 already holds everything.

**Tech Stack:** React 18, TypeScript, Tailwind, shadcn/ui, TanStack Query, @hello-pangea/dnd (already used), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-04-crm-productisering-design.md`. Goal 6 is the look; goals 2–3 are the fields and derived values. The Glass A reference mockup is option A in `.superpowers/brainstorm/46675-1793794747/content/visual-style-glass.html`. Plan 1's follow-ups are in `docs/superpowers/plans/2026-11-04-crm-fundament-followups.md`.

## Global Constraints

- **Branch.** Work on `feat/crm-design`, cut from `feat/crm-fundament`.
- **Never connect to production.**
  - Visual and manual checks run only against the local test stack: API `http://127.0.0.1:57321`, project dir `/private/tmp/claude-501/-Users-lp-wubs-Code/a14d3a10-2827-4c5d-8484-dba9f9ea33ff/scratchpad/localcrm`.
  - The app runs on port 5181 with `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` overridden to that stack.
  - Never start the app with the default `.env`, which points at production.
- **No new migrations** in this plan.
- **Generated types stay stale.** CRM tables and RPCs go through `const db = supabase as any` with the eslint-disable comment as in `src/hooks/useMeetings.ts:8-9`. Shared interfaces live in `src/lib/crmTypes.ts`.
- **Copy is Dutch, in sentence case.**
  - No ALL-CAPS labels, no middle-dot meta strings ("A · B"), and no "→" appended to buttons.
  - Money uses `nl-NL` formatting with "€". Large values are compact: `€800k`, `€5–10 mln`, `€6,75–12,0 mln`.
- **The look is Glass A, daylight**, with these exact tokens:
  - background base `#eef2ee`
  - ink `#1b2430`
  - glass surface `rgba(255,255,255,0.52)`, border `rgba(255,255,255,0.75)`, blur `28px`, saturate `180%`
  - card surface `rgba(255,255,255,0.78)`
  - radius: panels 16px, cards 12px, pills 999px
  - font stack `-apple-system, "SF Pro Text", "SF Pro Display", Inter, system-ui, sans-serif`, with tabular numbers on money
  - accent = the org's `primary_color_hex`, falling back to `#0F9B7A`
- **Readability comes first.**
  - Text on glass meets WCAG AA (4.5:1 body, 3:1 large).
  - Where `backdrop-filter` is unsupported, or `prefers-reduced-transparency: reduce` is set, surfaces fall back to solid `#ffffff`/`#f6f8f6`.
  - Motion respects `prefers-reduced-motion`.
- **Dark mode keeps its current tokens untouched.** The "Glass B" dark mode is a later plan, so the theme toggle must keep working.
- **Behaviour is unchanged unless a task says otherwise.**
  - Drag-and-drop stage moves, webhooks, the lead dialog, fees and billing types, appointments, the activity tab, company panel, prep/intake and meeting review keep working.
- **Range amounts.** When a funnel's `amount_mode='range'`, saving sets `value_eur` to the midpoint of min and max (null if either is missing), so finance, webhooks and older views stay consistent. The UI shows the range. With `amount_mode='none'`, no amount UI is shown.
- **The weighted value** is shown only when the funnel has `win_chance` enabled: Σ(amount × chance/100), using the midpoint for ranges, and only over deals that have both values.
- **Mobile.** The layout works at 375px width with a 16px gutter and no horizontal page scroll, except inside the board's own horizontal scroller.

## Review Focus

1. **A funnel with `amount_mode='none'`** must show no €-totals anywhere (board, list, KPI tiles), not "€0".
2. **Deals missing a value** (no amount, no win chance) must be excluded from the weighted value, not counted as zero. Totals must say what they cover, e.g. "Gewogen (2 van 8 deals)".
3. **A custom choice field whose option was archived or renamed.** Existing deals show the current label of the stored option id. An archived option still shows its label, marked "(gearchiveerd)", and can't be newly chosen.
4. **Long Dutch stage names** ("Mondeling toegezegd / bevestigen") and long titles must not break columns, cards or the table at 1280px or at 375px.
5. **The "Algemeen" group view** must not show funnel navigation or try to write. Its totals count only `organizations.kind='label'` orgs (spec ruling 1).

---

### Task 1: Field logic module

**Files:**
- Create: `src/lib/dealFields.ts`, `src/lib/dealFields.test.ts`
- Modify: `src/lib/crmTypes.ts` (extend `Funnel` with `amount_mode`; `CrmField` with `options: {id,label,position,archived}[]`; `Deal` fields `value_min_eur`, `value_max_eur`, `win_chance`, `priority`, `country`, `planned_start`, `lead_source`, `category`, `description`, `custom`, `funnel_id`)

**Interfaces:**
- Produces:
  - **Formatting:**
    - `formatEuroCompact(n: number): string`: 800000 → "€800k", 5000000 → "€5 mln", 6750000 → "€6,75 mln", 2500 → "€2.500"
    - `formatAmount(deal, funnel): string | null`:
      - fixed: compact `value_eur`
      - range: "€5–10 mln" when min ≠ max, a single value when equal, "€150k–400k" across units
      - none: null
      - missing values: null
  - **Totals:** `funnelTotals(deals, funnel, fields): { count: number; amount: { min: number; max: number } | null; weighted: { value: number; covered: number } | null }`
    - `amount` is null for mode none.
    - For fixed mode, min = max = Σ value_eur.
    - For range mode, the sums are taken over deals that have both min and max (with `value_eur` used as both bounds when only it is set).
    - `weighted` is null unless `win_chance` is enabled.
  - **Field values:**
    - `fieldValue(deal, field): unknown`: built-ins read their column; custom fields read `deal.custom[field.id]`.
    - `displayValue(field, raw): string | null`: choice options by id → label, with `(gearchiveerd)` appended for archived ones; date as `d MMM yyyy` in nl; number with %; yes_no as Ja/Nee.
    - `buildDealPatch(deal, funnel, edits: Record<fieldId, unknown>, fields): Partial<Deal>`:
      - maps built-in keys to columns and merges custom values into a copy of `deal.custom`;
      - for an amount in range mode, sets `value_min_eur`/`value_max_eur` and the `value_eur` midpoint;
      - in fixed mode, sets `value_eur`;
      - validates min ≤ max and chance 0–100, throwing a Dutch `Error` on violation.
  - **Visibility:** `visibleFields(fields, entity='deal')`: enabled, not archived, sorted by position.

- [ ] **Step 1: Write failing tests**, covering every example above, plus:
  - weighted value over a mixed set with "covered" counts;
  - mode none → `amount: null`;
  - an archived choice label;
  - range validation throws "Minimum mag niet hoger zijn dan maximum";
  - a custom field patch keeps other custom keys.
- [ ] **Step 2:** `npx vitest run src/lib/dealFields.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(crm): deal field logic for funnels`

### Task 2: Funnel data hooks

**Files:**
- Create: `src/hooks/useFunnels.ts`, `src/hooks/useFunnels.test.tsx`
- Modify: `src/hooks/usePipeline.ts`:
  - `useStages(funnelId?)` filters by funnel when given;
  - `useDeals(funnelId?)` filters by funnel when given and selects the new columns;
  - `useUpdateDeal` accepts the new columns and `custom`.

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `useFunnels(): Query<Funnel[]>`: the current org, not archived, ordered by position; disabled in the group view.
  - `useFunnel(funnelId)`.
  - `useFunnelFields(funnelId): Query<CrmField[]>`: entity 'deal', that funnel.
  - `useEntityFields(entity: 'company' | 'contact')`.
  - `useDealContacts(dealId): Query<{contact_id, role, is_primary, contact: {name,email,phone}}[]>`.
  - `useDealHistory(dealId): Query<HistoryRow[]>`: `crm_history` where entity in ('deals','deal_contacts','deal_activities','deal_fees') and the record is this deal or belongs to it. The simplest correct filter: `record_id = dealId OR changes->>'deal_id' = dealId`, newest first, limit 200.
- [ ] **Step 1: Failing tests.** Mock the supabase chain as in `src/components/deal/ActivityTab.test.tsx`. Assert:
  - the table, filters and order used by `useFunnels`, `useFunnelFields` and `useDeals('f1')`, including `.eq('funnel_id','f1')`;
  - `useDealHistory` uses an `or()` filter for both conditions.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the whole suite. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(crm): funnel, field, contact and history hooks`

### Task 3: Glass tokens, org accent and restyled primitives

**Files:**
- Modify:
  - `src/index.css`: light theme variables only; add the glass utilities `.glass`, `.glass-card` and `.app-backdrop`, plus the fallback `@supports not (backdrop-filter: blur(1px))` and the `prefers-reduced-transparency` media query.
  - `tailwind.config.ts`: fontFamily `sans` per Global Constraints; `fontVariantNumeric` via a `tabular` utility if needed.
  - `src/components/ui/{card,dialog,sheet,popover,dropdown-menu,select,table,tabs,button,input,badge}.tsx`: surface and radius classes only, no API changes.
- Create:
  - `src/lib/color.ts` + `src/lib/color.test.ts`
  - `src/components/layout/OrgAccent.tsx`

**Interfaces:**
- Produces:
  - `hexToHslTriplet(hex): string`, e.g. "#5f9e35" → "96 50% 41%".
  - `readableOn(hex): '#ffffff' | '#1b2430'`: picks the text colour with the higher contrast.
  - `<OrgAccent/>`: sets `--org-accent` (HSL triplet) and `--org-accent-foreground` on `document.documentElement` from the current org's `primary_color_hex`, falling back to `#0F9B7A`. Mapped so `--primary` and `--ring` follow the org accent in light mode.
  - `.app-backdrop`: a soft multi-radial background tinted with `hsl(var(--org-accent) / 0.18)` plus a cool-blue secondary, over `#eef2ee`.
- [ ] **Step 1: Failing tests** in `color.test.ts`:
  - the hex → HSL examples (#5f9e35, #0F9B7A, #ffffff);
  - `readableOn('#5f9e35')` is '#ffffff' and `readableOn('#f5e663')` is '#1b2430';
  - invalid input falls back to the default accent.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** Mount `<OrgAccent/>` once inside the authenticated layout.
- [ ] **Step 4:** Run `npx vitest run` and `npm run build`. Expected: PASS and the build is OK.
- [ ] **Step 5: Commit** — `feat(design): glass tokens and per-organisation accent`

### Task 4: App shell — floating glass sidebar and top bar

**Files:**
- Modify:
  - `src/components/layout/AppLayout.tsx`: `.app-backdrop` on the root; inset 12px gutters on desktop; the main column scrolls; the top bar becomes a glass pill holding breadcrumbs, the notification bell and the account menu; keep the mobile drawer, the ⌘B collapse and the localStorage key.
  - `src/components/layout/AppSidebar.tsx`: the glass panel. Nav groups, in sentence case:
    - a top group, with Dashboard and Agenda;
    - "Funnels", listing `useFunnels()` as `/pipeline/:funnelId` with a deal count per funnel;
    - "Relaties", with Contacten, Meetings and Prullenbak;
    - the remaining existing items (finance, boards and so on) unchanged, below.
  - `src/components/layout/BrandSwitcher.tsx`: restyle only.
  - `src/App.tsx`: the route `/pipeline/:funnelId`. `/pipeline` redirects to the first funnel, and renders the old page if the org has no funnel.
- Test: `src/components/layout/AppSidebar.test.tsx`.

**Interfaces:**
- Consumes: `useFunnels` (Task 2), `OrgAccent` (Task 3).
- [ ] **Step 1: Failing test.**
  - The sidebar lists the funnels "Projecten" and "Partnerschappen" from a mocked `useFunnels`, linking to `/pipeline/<id>`.
  - The active funnel has `aria-current="page"`.
  - In the group view (`isAllView` true) the "Funnels" group isn't rendered.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the suite and the build. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(design): glass app shell with funnel navigation`

### Task 5: Funnel board

**Files:**
- Create:
  - `src/pages/FunnelPage.tsx`: header, KPI tiles, Bord/Lijst toggle, board.
  - `src/components/funnel/FunnelBoard.tsx`, `src/components/funnel/DealCard.tsx`, `src/components/funnel/KpiTiles.tsx`
  - Tests: `src/components/funnel/DealCard.test.tsx`, `src/components/funnel/KpiTiles.test.tsx`
- Modify:
  - `src/App.tsx`: `/pipeline/:funnelId` → `FunnelPage`.
  - `src/pages/PipelinePage.tsx`: extract and reuse `LeadDialog`/`NewDealDialog` (export them, or move them to `src/components/funnel/`) so the new board keeps quick-add and the lead flow. Keep the old page reachable only as the no-funnel fallback.

**Interfaces:**
- Consumes: Tasks 1–3, `useMoveDeal`, `useAgenda` (next-appointment badge, as on the old card).
- Produces:
  - **The card** shows, in this order:
    - title, with up to 2 lines then ellipsis;
    - subtitle: company name, plus country when enabled, joined with ", ";
    - amount via `formatAmount`;
    - a win-chance chip, plus a 5px meter, when enabled and set;
    - a priority chip when enabled and set;
    - an owner avatar with initials;
    - the next-appointment badge, as now.
  - **The column header:** stage name (wrapping allowed, max 2 lines), count, and column amount total (hidden for mode none).
  - **KPI tiles:** "Open deals" (count); the amount tile, labelled "Open, bandbreedte" for range or "Open waarde" for fixed, hidden for none; "Gewogen" with an "x van y deals" hint, only when win chance is enabled. Won and lost stages are excluded from the "open" figures.
  - **Search** (existing behaviour) filters by title and company.
- [ ] **Step 1: Failing tests.**
  - `DealCard`:
    - a range funnel shows "€5–10 mln";
    - win chance 65 shows "65%" plus a meter with `aria-valuenow=65`;
    - a disabled field is not rendered;
    - mode none renders no "€".
  - `KpiTiles` for a range funnel with the Buitenbeleving-like fixture shows:
    - "€6,75–12,0 mln";
    - "Gewogen" "€1,32 mln" with "2 van 8 deals". Stekken is 100% of €800k and Luxemburg 65% of €800k, the only two deals with both values. This matches the Buitenbeleving sheet's own "gewogen waarde (partieel) 1.320.000";
    - no amount tile when mode is none.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** Drag-and-drop via `@hello-pangea/dnd`, calling `useMoveDeal` exactly as the old board does (webhooks unchanged). The board scrolls horizontally inside its own container, with columns 280px wide on desktop and 85vw on mobile.
- [ ] **Step 4:** Run the suite and the build. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(crm): funnel board with configured fields`

### Task 6: List view

**Files:**
- Create: `src/components/funnel/FunnelTable.tsx`, `src/components/funnel/FunnelTable.test.tsx`
- Modify: `src/pages/FunnelPage.tsx`: the Bord/Lijst toggle, remembered per funnel in localStorage (wrapped in try/catch).

**Interfaces:**
- Produces:
  - **Columns:** Deal, Bedrijf, Fase, then every visible field in position order (built-in and custom), then Eigenaar.
  - **Sorting:** clicking a header sorts by that column's raw value, cycling asc → desc → none, with `aria-sort` set.
  - **Rows:** clicking a row opens the deal panel. On mobile the table scrolls horizontally inside its card.
- [ ] **Step 1: Failing tests.**
  - The columns follow the field config: a disabled field is absent and a custom field "Aantal woningen" is present.
  - Sorting by "Winkans" orders 100 > 65 > empty, with empty values always last.
  - The amount column shows ranges.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(crm): funnel list view with sortable field columns`

### Task 7: Deal panel — field editor, contacts, history

**Files:**
- Create:
  - `src/components/deal/DealPanel.tsx`: a right-side `Sheet`, 560px on desktop and full-screen on mobile.
  - `src/components/deal/DealFieldsEditor.tsx`, `src/components/deal/DealContacts.tsx`, `src/components/deal/HistoryTab.tsx`
  - `src/lib/historyText.ts` + `src/lib/historyText.test.ts`
  - Tests: `src/components/deal/DealFieldsEditor.test.tsx`
- Modify: `FunnelPage` opens `DealPanel`. `DealHubDialog` stays for the old page and the meeting review.

**Interfaces:**
- Consumes: Tasks 1–2, plus the existing `ActivityTab`, `AppointmentsPanel`, `CompanyPanel`, `PrepIntakeTab` and `useDeleteDeal`.
- Produces:
  - **The panel header:** an editable title, a stage select limited to this funnel's stages, `formatAmount`, and a "Verwijderen" action ("Verplaatst naar prullenbak" toast, as now).
  - **Tabs:** Overzicht (fields editor + contacts), Activiteit, Afspraken, Bedrijf, Voorbereiding (existing PrepIntake), and Historie.
  - **The fields editor** renders one control per visible field:
    - money: a fixed input, or a min–max pair in range mode;
    - number: 0–100 for win_chance, with a % suffix;
    - text and long_text; date (calendar popover); choice (select of non-archived options, while a current archived value is still shown); yes_no (switch);
    - built-in billing_type: a select from `useBillingTypes`.
  - **Saving:** "Opslaan" calls `buildDealPatch` and then `useUpdateDeal`. Validation errors show inline in Dutch.
  - **Contacts:** lists `deal_contacts` (primary first, with role), and supports adding an existing contact of the org, setting primary and removing. All writes go to `deal_contacts`; the DB syncs `deals.contact_id`.
  - **History:** `historyLine(row, fields, stages): string` renders Dutch sentences:
    - "Robin wijzigde Winkans van 50% naar 65%"
    - "Fase: Offerte in voorbereiding → Mondeling toegezegd"
    - "Notitie toegevoegd"
    - "Deal naar prullenbak verplaatst"
    - "Teruggezet uit prullenbak"
    - The actor's name comes from profiles; a null actor reads "Systeem". Unknown columns use the column name.
- [ ] **Step 1: Failing tests.**
  - `historyText`: each example above, with field labels resolved from `crm_fields` and stage names resolved by id.
  - `DealFieldsEditor`:
    - entering 150000 and 400000 in range mode calls the update with min, max and `value_eur` 275000;
    - min greater than max shows "Minimum mag niet hoger zijn dan maximum" and doesn't call the update;
    - choosing a custom choice stores the option id under `custom[fieldId]`, keeping the other custom keys.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the suite and the build. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(crm): deal panel with field editor, contacts and history`

### Task 8: Group view counts own labels only; restyle pass on other pages

**Files:**
- Modify:
  - `src/hooks/useOrganization.tsx`: select `kind`; `allOrgIds` = orgs with `kind='label'`. The "Algemeen" entry appears only when the user has two or more label orgs.
  - `src/pages/DashboardPage.tsx`: the group view header copy is "Algemeen (eigen labels)".
  - Visual-only class changes on `DashboardPage`, `ContactsPage`, `AgendaPage`, `TrashPage`, `SettingsPage` and `MeetingsPage`: page header pattern, glass cards, no layout logic changes.
- Test: extend or add `src/hooks/useOrganization.test.tsx`.

- [ ] **Step 1: Failing test.** With orgs [label A, label B, client C], `allOrgIds` = [A, B] and the "Algemeen" entry exists. With [label A, client C], there's no "Algemeen".
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the suite and the build. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(design): own-label group view and restyled pages`

### Task 9: Local visual verification

**Files:**
- Create: `docs/superpowers/plans/2026-11-04-crm-design-board-screens.md` (a checklist with results).
- Uses (no commit): the local stack.

- [ ] **Step 1: Prepare the local stack data** (local only, via `docker exec` psql into the `supabase_db_klikklaar-crm-test` container):
  - set `primary_color_hex` to `#5f9e35` for "Buitenbeleving (test)" and `#0F9B7A` for "Klikklaar (test)";
  - add a second Buitenbeleving funnel "Partnerschappen" with stages Verkenning, In gesprek, Afspraken gemaakt, Actief partner, Gewonnen (won), Verloren (lost), and move the deal "Waterland / partners België" into it (stage Verkenning);
  - add one custom deal field "Aantal woningen" (number) to Projecten, and set it to 70 on the Stekken deal.
- [ ] **Step 2: Walk through the app.** Start it on port 5181 against the local stack. Use the browser tools to check, at 1440×900 and at 390×844:
  - the Buitenbeleving board and list;
  - the deal panel for Luxemburg: edit the win chance to 70, save, and see Historie show the change;
  - Partnerschappen showing no €-tiles;
  - Klikklaar's board (fixed amounts, no win chance);
  - the Dashboard, Contacten, Prullenbak and Instellingen pages.
- [ ] **Step 3: Record each check** as pass/fail with a one-line note in the checklist file. Fix-list items go back to the owning task's implementer.
- [ ] **Step 4: Commit** the checklist — `docs: plan 2 visual verification`
