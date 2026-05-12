## Doel

Twee verbeteringen voor de SE leadlijst (`/leads`):

1. **Notitie-knop per lead** — muis-only expander om snel een notitie toe te voegen/lezen, zonder dat 'ie meedoet in de Tab-volgorde van het belproces.
2. **Nieuwe tab "Closer status"** — callers zien wat er met hun ingeplande leads gebeurt aan de closer-kant.

---

## Deel 1 — Notitie-knop op lead-rijen (nu)

**Plek:** `src/components/leads/SELeadsList.tsx` — extra icon-knop in de actie-kolom van iedere rij, naast de bestaande call-acties.

**Gedrag:**
- Klein icoontje (Lucide `StickyNote`) — alleen klikbaar met muis.
- `tabIndex={-1}` zodat de knop overgeslagen wordt door Tab (belflow blijft: nummer kopiëren → outcome → volgende lead).
- Klik opent een popover/dialog met:
  - Bestaande notities (uit `crm_activities` waar `activity_type = 'note'` voor deze `lead_assignment_id`), nieuwste bovenaan.
  - Textarea + "Opslaan"-knop → schrijft nieuwe rij in `crm_activities` (`activity_type='note'`, `note=...`, `done=true`, `sales_executive_id`, `lead_assignment_id`).
- Indicator-dot op de knop wanneer er ≥1 notitie bestaat.
- Hergebruik bestaande styling van `ExpandableNote` voor consistentie.

**Geen schema-wijziging** — `crm_activities` heeft alle velden al.

---

## Deel 2 — Closer-status tab (later, nu alleen ontwerp)

**Plek:** Nieuwe tab/sectie binnen `/leads` (bv. tabs "Mijn leads" | "Bij closer"), of nieuwe route `/leads/bij-closer`.

**Wat de caller ziet per ingeplande lead:**
| Kolom | Bron |
|---|---|
| Bedrijf / contact | `closer_appointments.org_name` / `contact_name` |
| Afspraak datum | `scheduled_at` |
| Closer | join op `closer_user_id` → `profiles.full_name` |
| Status | `closer_appointments.status` (Bellen, No show, Follow-up, Deal, Nog betalen, Geen deal) als `StatusBadge` met `CLOSER_STATUSES.tone` |
| Deal waarde | `deal_value_eur` (alleen als status = deal/nog_betalen) |
| Laatste update | `last_activity_at` |
| Notities closer | `notes` via `ExpandableNote` (read-only voor caller) |

**Filter:** `caller_sales_executive_id = current_se.id` zodat een caller alleen z'n eigen doorgezette leads ziet. RLS check: bestaande policies op `closer_appointments` ondersteunen dit al via `organization_id` + SE-koppeling — verifiëren bij implementatie.

**Realtime:** Subscribe op `closer_appointments` changes → tab badge met aantal status-wijzigingen sinds laatste bezoek (optioneel, v2).

**Notificaties (optioneel):** Trigger op `closer_appointments` UPDATE waar `status` verandert → push naar `caller_sales_executive_id.user_id` via bestaande `notifications` flow ("Je lead Acme BV staat nu op Deal 🎉"). Past in bestaande pg_net push-architectuur.

---

## Technische details

- Geen migrations nodig voor Deel 1.
- Deel 2 mogelijk 1 view of indexed query op `closer_appointments(caller_sales_executive_id, status)`.
- Beide delen respecteren `useOrgId` voor brand-isolatie (KlikKlaar / OTR / IDEA).
- Geen wijziging aan belflow / Tab-volgorde — notitieknop expliciet `tabIndex={-1}`.

---

## Volgorde

1. Notitie-knop bouwen en uitrollen.
2. Daarna: closer-status tab — eerst statisch read-only, dan eventueel realtime + notificaties.
