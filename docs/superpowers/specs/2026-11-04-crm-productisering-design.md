# CRM as a product: configurable funnels, tasks and a new look

Status: draft, 4 November 2026. Agreed in conversation with Robin; awaiting his read-through.

## Why

The Klikklaar CRM (sales.klikklaarseo.nl) started as Klikklaar's own sales tool. More clients are going to use it, starting with Buitenbeleving, and each client works differently. Buitenbeleving tracks projects with a price range, a win chance and a country; another client wants one fixed price and nothing else. Today every client gets the same fixed deal fields and one pipeline, so the CRM can't fit them.

Robin's goal is to modernise the whole CRM and get it to "a crm that is basically a lot more professional and productised". HubSpot is the benchmark: it should feel native and high-end, "a product that is worth paying a lot of money for".

Robin's hard requirement: **data must never get lost or go missing.** Recent history explains why: in October a deal note (Unica) disappeared silently because a save error was swallowed.

## Goals

1. **Funnels per client, as many as needed.** A client can have several funnels, for example Buitenbeleving "Projecten" and "Partnerschappen". Creating a funnel is quick. The funnel name, its stages and every dropdown option can be renamed and reordered.
2. **Fields per funnel.**
   - Built-in fields that can be switched on or off per funnel: win chance (%), amount as either a fixed price or a range (min–max), country, priority, planned start date, lead source, category, and description/scope.
   - Custom fields created by the configurator, for example "aantal woningen" or "hectare". Types: text, long text, number, money, date, choice list, yes/no.
   - Companies and contacts also get custom fields, configured per client.
3. **Derived values follow the configuration.** When a funnel has a win chance, the weighted value appears automatically on the board and dashboard: amount × chance, using the midpoint of a range. When a funnel has a range, totals show as a range. The dashboard never claims more than the configured fields support.
4. **Tasks as the core of follow-up, as in HubSpot.**
   - Each task has a title, owner, due date, type (call, e-mail, to-do), priority and status.
   - Status options: open, in progress, waiting for reply, done, cancelled. The completion date is recorded.
   - A task can link to a deal, contact or company, or stand alone ("Leadlijst in centrale CRM delen").
   - Appointments (fixed time, calendar) stay as they are, next to tasks.
5. **Contacts that match reality.**
   - One contact can link to several deals.
   - A contact can exist without a company.
   - A contact has a relationship type (klant, prospect, netwerk, partner, leadpartner, leverancier, intern). Each client can edit that list.
   - A contact has a role per deal (for example beslisser or leadbron) and a relationship owner.
6. **A new look across the whole app: "Glass A, daylight".** Robin chose this from mockups.
   - Translucent glass panels (sidebar, toolbar, stat tiles, board columns) float over a soft background tinted with the client's own colour.
   - Rounded shapes and Apple-style system typography (SF Pro on Apple devices).
   - Each client's brand colour is the accent; Buitenbeleving is green.
   - Every page gets the new look, including the finance pages.
   - Reference mockup: `.superpowers/brainstorm/46675-1793794747/content/visual-style-glass.html`, option A.
7. **Who configures.** Klikklaar's own admins (super_admin) and the client's own admin can create and edit funnels, stages, fields, option lists, the brand colour and the relationship types. Ordinary users only work in the CRM.
8. **Modules per client.** The CRM is always on. Other modules (invoices, contracts, finance, boards, growth and so on) are switched on per client, so a client only sees what was agreed with them. `organizations.modules` already exists and is the place for this.
9. **Data safety, end to end.**
   - **Trash.** Deleting a deal, company, contact, task or note moves it to a trash bin it can be restored from. Nothing is permanently deleted from the normal UI.
   - **Change history.** Every change to a deal, company or contact is recorded and visible: who changed which field, from what to what, and when.
   - **Fields are hidden, never deleted.** Switching a field off for a funnel hides it; its stored values stay, and switching it back on brings them back. Renaming an option relabels it without breaking the records that use it.
   - **Saves never fail silently.** Every failed write shows an error and keeps the user's input. This is the Unica lesson.
10. **Everything moves into the new structure, with nothing lost.**
    - Every existing client (Klikklaar, OneTimeRecruit and the others) moves over. That includes every deal, company, contact, note/activity, appointment, stage history, won/lost record and meeting import.
    - Each client's current pipeline becomes their first funnel, with the same stages in the same order and the current deal fields switched on.
    - The migration is verified with counts and value sums per client before and after. The switch happens only when every number matches. The old data is kept intact, not dropped, until Robin signs off.
11. **Buitenbeleving onboarded.**
    - They get their own client account with a "Projecten" funnel, plus "Partnerschappen".
    - Projecten uses the stages from their sheet: Lead / verkenning, Kwalificatie, Kansrijk / verificatie, Offerte in voorbereiding, Mondeling toegezegd / bevestigen, Uitvoering genoemd / bevestigen, Partnerverkenning, Onderhandeling, Gewonnen, Verloren. The fields are the ones their sheet uses: range, win chance, country, priority, category, planned start, lead source, scope.
    - Their Excel (`~/Downloads/Buitenbeleving_CRM_Liggend_Passend_03-11-2026 7.xlsx`) is imported: 8 leads, 9 contacts and 10 actions, which become tasks. The sheet's "te verifiëren" remarks come along as notes.

## Non-goals (for later)

- The CRM as an embeddable module inside other apps, such as the Buitenbeleving backoffice. Keep the CRM's data and UI separable enough that this stays possible, but don't build it now.
- Making the finance modules (Bunq, Stripe, invoices, liquidity, revenue target) work for multiple clients. Those stay Klikklaar-only and only get the new look.
- Dark mode. "Glass B, night" from the mockups is the intended dark mode later.
- Clients configuring their own modules or billing. Klikklaar switches modules on.

## Anti-goals (would count as failure even if everything else works)

- Any record, note, history entry or field value lost or silently changed during migration or configuration changes.
- A save that fails without telling the user.
- Configuration that only a developer can do. Setup must work through screens.
- A glass effect that hurts readability. Text and numbers must stay crisp and high-contrast on every background, and the app must stay usable where `backdrop-filter` isn't supported.
- A generic "admin template" feel. The bar is HubSpot or better.

## Constraints

- **Stack and hosting.**
  - Existing Lovable project: Vite, React 18, TypeScript, TanStack Query, shadcn/ui, Tailwind.
  - Supabase project `boxmdblzhuyfontwibdj`; Lovable project `d32bf8e7-c4f0-46e8-b857-540e410dd58d`.
  - Deploy: merge to `main`, then publish through Lovable.
- **Migrations.** Remote migration history stops at `20260610000004`, and many later migrations were applied by hand. Never run `supabase db push` from the repo root. Push new migrations from a temporary directory containing only the remote-registered migrations plus the new ones (see the meeting-proposals work).
- **Multi-tenancy.**
  - Access is by organisation membership (`user_organizations`) under RLS.
  - The "Algemeen" group view aggregates across organisations (`useOrgId` returns null there). New features must keep working in, or deliberately hide from, that view.
- **Roles.**
  - Global roles live in `user_roles` (super_admin, admin, coach, sales_executive, closer).
  - Per-client membership has a `role` text column in `user_organizations` (default `member`). "Client admin" should be expressed there.
- **Stage names.** Won and lost are currently recognised by stage name (won/gewonnen, verloren/lost). The new structure makes "won" and "lost" an explicit stage type in every funnel. Those two can be renamed but not removed.
- **Data volume.** PostgREST returns at most 1000 rows; large tables must be paged.
- **Meetings feature.**
  - The meeting-transcript feature (branch `feat/meeting-voorstellen`) proposes changes to stages, values, owners, notes and appointments.
  - Its database part and AI function are live, but its screens are not yet published. It now uses Claude (`claude-opus-5-5`) and is waiting for Anthropic credit.
  - It must be adapted to funnels, configurable fields and tasks. "Volgende actie" proposals should become tasks.
  - Merge it before this work starts, or build this work on top of it.
- **Webhooks.** Existing webhook events (deal.created, deal.stage_changed, deal.won, deal.lost) must keep firing with compatible payloads.

## Decided in conversation

| Topic | Decision | Source |
|---|---|---|
| Who sets up a client | Klikklaar, after a setup meeting with the client | Robin |
| Several funnels per client | Yes | Robin |
| Custom fields | Yes, alongside switchable built-in fields | Robin |
| Look | Glass A (daylight); B later as dark mode | Robin, from mockups |
| Who can configure | Klikklaar admins and the client's admin | Robin |
| Tasks | Yes, HubSpot-style, next to appointments | Robin |
| Trash and change history | Yes | Robin |
| Modules per client | Yes; finance later | Robin |
| Embeddable module | Later | Robin |
| Contacts: many deals, no company, relationship type, role per deal | Yes | My call, Robin agreed |
| Custom fields on companies and contacts | Yes | My call, Robin agreed |
| Won/lost fixed in every funnel | Yes | My call, Robin agreed |
| Removing a field hides it, data kept | Yes | My call, Robin agreed |

## Settled after review (my calls unless marked; Robin to check while reading)

1. **Own labels vs clients.**
   - Each organisation is marked as either an *own label* (Klikklaar, OneTimeRecruit and so on) or a *client* (Buitenbeleving and later ones).
   - The "Algemeen" group view only adds up own labels. Client data is never mixed into Klikklaar's totals; to see it, switch to that client's account.
   - Where funnels differ, Algemeen shows totals per funnel rather than one combined board.
2. **Login.** Robin decided this one.
   - For now, clients log in at sales.klikklaarseo.nl and see their own colour and logo.
   - Later the CRM moves to a Mandate domain; Mandate Central already has BuitenBeleving as a tenant. That move is out of scope here.
   - Keep branding and login per organisation, not per hostname, so the move stays simple.
3. **User management.** Klikklaar admins and the client's admin can invite and remove users for that client. A client admin can never see or touch other organisations.
4. **Who counts as a Klikklaar admin.** The global roles `super_admin` and `admin`. Only they can create organisations and switch modules on. Coaches, sales executives and closers can't configure anything.
5. **Billing interval is a built-in field.**
   - The amount can carry an interval: one-off, per month or per year.
   - It is switched on for Klikklaar's migrated funnel, so the forecast, growth and revenue pages keep calculating exactly as now.
   - Weighted values and totals respect the interval.
6. **Migration approach: additive, in place, with a frozen copy.**
   - New structure is added next to the existing tables: a funnel per deal and field-definition tables. Existing columns are not removed.
   - Before the switch, a full snapshot copy of the CRM tables is taken and kept until Robin signs off.
   - Edge functions and pages that read `deals` directly keep working throughout. Each one is either updated or verified unaffected before the old shape changes.
7. **Klikklaar-specific automations stay Klikklaar-only.** Signal engine, coaching, pipeline summary and lead recycler run only for orgs that have the matching module. Webhooks stay per organisation, as today.
   - For a deal with a range, `value_eur` in webhook payloads is the midpoint, and `value_min_eur` / `value_max_eur` are added.
   - Klikklaar's existing consumers see unchanged payloads, because their funnels use fixed amounts.
8. **Modules.**
   - Tasks, trash, history and meetings are part of the always-on CRM core.
   - Buitenbeleving gets the CRM core plus agenda and contacts. Nothing else unless agreed.
   - The builder defines the full module key list from the pages that exist.
9. **Buitenbeleving "Partnerschappen" funnel.** It is set up with simple starting stages: Verkenning, In gesprek, Afspraken gemaakt, Actief partner, plus won/lost.
   - Fields: relationship owner, country, description; no amount.
   - It gets adjusted in the setup meeting through the screens. That is configuration, not a code task.
10. **Permanent deletion.**
    - The trash keeps items indefinitely.
    - Admins have a separate "delete permanently" path for privacy requests. It also removes that person's data from the change history and leaves a record that a deletion took place.
11. **Smaller calls.**
    - The existing `deals.contact_id` becomes the deal's primary contact.
    - Amounts are in euros only.
    - The meetings branch is merged first, and this work builds on it.

## Left to the builder

- **Data model for configurable fields:** typed columns for built-ins plus a JSON column per record for custom fields, an entity–attribute–value design, or something else. The requirements:
  - Values survive field changes.
  - Fields can be filtered and sorted on the board and list.
  - Reports can sum money fields.
- **History mechanism:** triggers writing to a history table, or something else. Every write path must be covered, including RPCs and imports.
- **Configuration screen design.** It must feel as polished as the rest, with live preview welcome.
- **The list view** (table) next to the board: columns follow the funnel's fields.
- **Delivery order.** This is several plans' worth of work. A sensible order:
  1. Data foundation and safety: funnels, field definitions, trash, history, migration with verification.
  2. New design shell plus board, list and deal detail.
  3. Tasks.
  4. Configuration screens and modules.
  5. Buitenbeleving onboarding and import.
  6. Adapting the meetings feature.

  Each step should leave the live CRM working.
