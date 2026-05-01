# Closer-rol + Calendly CRM

## Doel

Een nieuwe **Closer**-rol in het systeem (Luuk) die afspraken krijgt toegewezen die door cold callers (Huub = SE) worden ingepland via een team-Calendly. Closer werkt in een eigen kanban-CRM met 6 statussen. Cold caller blijft eigenaar van de oorspronkelijke lead, closer is eigenaar van de afspraak.

## Architectuur in 1 oogopslag

```text
Cold caller (Huub, SE)
        |
        | plant in via team-Calendly link
        | hidden field: caller_se_id
        v
Calendly  ----invitee.created webhook--->  edge function: calendly-webhook
                                                    |
                                                    | round-robin: kies actieve closer
                                                    | maak rij in: closer_appointments
                                                    | link naar pipedrive_lead_assignments (caller-lead)
                                                    v
                                            Closer kanban (Luuk)
                                            6 kolommen: call | no show | follow-up | deal | nog betalen | no deal
```

## Wat we nu bouwen (deze ronde)

### 1. Nieuwe rol `closer`

- Enum `app_role` uitbreiden: `super_admin | admin | coach | sales_executive | closer`.
- Zelfde patroon als bestaande rollen (`user_roles` tabel + `has_role()` security definer).
- `AppRole` type in `src/types/database.ts` bijwerken.
- Toevoegen aan `UserManagementPage` met label "Closer" en eigen kleur/icoon (bijv. `Handshake` Lucide icon).
- Nieuwe SE-flow blijft ongewijzigd; closers worden los aangemaakt via Gebruikersbeheer (geen aparte provisioning wizard nodig).

### 2. Database (1 migratie)

**Tabel `closer_appointments`** (de kanban-rijen):

| kolom | type | doel |
|---|---|---|
| `id` | uuid pk | |
| `closer_user_id` | uuid (auth.users id) | eigenaar = Luuk |
| `caller_sales_executive_id` | uuid | Huub (SE die inplande) |
| `lead_assignment_id` | uuid nullable | link naar `pipedrive_lead_assignments` als match gevonden |
| `status` | text, default `'call'` | enum-achtig: `call`, `no_show`, `follow_up`, `deal`, `nog_betalen`, `no_deal` |
| `org_name`, `contact_name`, `contact_email`, `contact_phone` | text | uit Calendly invitee + questions |
| `scheduled_at` | timestamptz | event start |
| `calendly_event_uri`, `calendly_invitee_uri` | text uniek | dedupe |
| `notes` | text | closer-notities |
| `deal_value_eur` | numeric nullable | bij status deal/nog betalen |
| `position` | integer | sortering binnen kolom (drag/drop later) |
| `created_at`, `updated_at` | timestamptz | |

**RLS** (strikt, zelfde patroon als `calls`/`pipedrive_lead_assignments`):
- Admins: ALL
- Closer: SELECT/UPDATE eigen rijen waar `closer_user_id = auth.uid()`
- Cold caller (SE): SELECT eigen rijen waar `caller_sales_executive_id IN (...mijn SE id's)` , read-only zodat hij ziet "mijn lead is een afspraak geworden"
- INSERT alleen via service role (edge function)

**Tabel `closer_round_robin_state`** (1 rij): `last_assigned_closer_user_id`, `updated_at`. Service-role only.

Validatietrigger zorgt dat `status` binnen toegestane set valt (geen CHECK constraint vanwege immutability-richtlijn).

### 3. Edge function `calendly-webhook` (`verify_jwt = false`)

- Endpoint waar Calendly `invitee.created` en `invitee.canceled` events naartoe stuurt.
- Verifieert handtekening met `CALENDLY_WEBHOOK_SIGNING_KEY` (secret die we toevoegen).
- Op `invitee.created`:
  1. Lees `tracking.utm_source` of hidden question `caller_se_id` uit payload, lookup in `sales_executives`.
  2. Kies volgende actieve closer (rol = `closer`, profile actief) via round-robin.
  3. Probeer match met bestaande `pipedrive_lead_assignments` op email of org-naam (best effort, mag null blijven).
  4. Insert `closer_appointments` met status `call`.
  5. Log naar `audit_logs` + insert `notifications` rij voor de closer.
- Op `invitee.canceled`: status -> `no_show`, log event.
- CORS-headers + nette 200 response zodat Calendly niet retried.

Secret toe te voegen: `CALENDLY_WEBHOOK_SIGNING_KEY` (vraag ik via add_secret na akkoord).

### 4. Closer CRM kanban — nieuwe pagina `/closer`

Layout:

```text
+----------------------------------------------------------+
| Closer CRM                              [Refresh] [Stats]|
+----------------------------------------------------------+
| Call(3)  No-show(1) Follow-up(2) Deal(4) Nog bet(1) No deal(7)|
| [card]   [card]     [card]      [card]  [card]      [card]|
| [card]              [card]      [card]              [card]|
| [card]                          [card]              [card]|
+----------------------------------------------------------+
```

- 6 kolommen exact in volgorde: **Call, No show, Follow-up, Deal, Nog betalen, No deal**.
- Card toont: bedrijf, contact, afspraak-tijd (date-fns NL), cold caller naam, telefoon (klikbaar `tel:`), email.
- Klik op card opent side sheet: alle info + notes textarea + status select + deal value input + "Bel cold caller" knop.
- Status wijzigen via select in sheet (drag-and-drop bewaren we voor later, scope deze ronde).
- Auto-refresh elke 60s + realtime subscription op `closer_appointments` voor instant updates.
- Top-stat strip: totaal afspraken deze week | conversie call->deal | open follow-ups.

Routing in `App.tsx`:
- Nieuwe route `/closer` met `<ProtectedRoute allowedRoles={['closer','admin','super_admin']}>`.
- Sidebar (`AppSidebar`): nieuw item "Closer CRM" met `Handshake` icon, alleen zichtbaar voor closer/admin.
- Closer-rol gaat na login direct naar `/closer` (in `DashboardPage` redirect toevoegen als `roles.includes('closer')` en geen SE/admin rol).

Componenten:
- `src/pages/CloserCRMPage.tsx`
- `src/components/closer/CloserKanban.tsx`
- `src/components/closer/AppointmentCard.tsx`
- `src/components/closer/AppointmentDetailSheet.tsx`
- `src/lib/closer-statuses.ts` — labels + kleuren (NL: "Bellen", "No show", "Follow-up", "Deal", "Nog betalen", "Geen deal")

### 5. Cold caller side

- In bestaande `SELeadsList` / lead detail: badge "Afspraak ingepland | [datum]" als er een gekoppelde `closer_appointments` rij is voor die lead.
- Read-only, geen kanban voor SE.

## Wat NIET deze ronde

- Admin funnel-dashboard (volgt zodra er ~2 weken data is — dan kunnen we echte targets en capaciteitsberekening tonen i.p.v. lege grafieken).
- Email-flows (no-show reminder, deal-bevestiging) — koppelen we later aan status-wijzigingen via trigger -> `process-email-queue`.
- Drag-and-drop tussen kolommen — eerst valideren of kanban überhaupt werkt in praktijk.
- Pipedrive-sync van closer-afspraken — eerst kijken of jullie het echt in Pipedrive willen of alleen hier.

## Wat jij moet regelen aan Calendly-kant (ik geef je instructie zodra de webhook live staat)

1. Eén team-event-type aanmaken met round-robin onder closers (eventueel start je met alleen Luuk).
2. In dat event-type een verplicht **hidden question** "caller_se_id" toevoegen (UUID van de cold caller). Cold caller plakt deze in zijn unieke booking-link, of we genereren per SE een vooraf-ingevulde link in zijn dashboard ("Plan afspraak in").
3. Calendly webhook configureren naar `https://gdeeigztmbvdpcgdpzdv.supabase.co/functions/v1/calendly-webhook` met events `invitee.created` + `invitee.canceled`. Signing key kopiëren -> ik vraag hem als secret.

## Bestanden die wijzigen / nieuw

**Nieuw**
- `supabase/functions/calendly-webhook/index.ts`
- `src/pages/CloserCRMPage.tsx`
- `src/components/closer/CloserKanban.tsx`
- `src/components/closer/AppointmentCard.tsx`
- `src/components/closer/AppointmentDetailSheet.tsx`
- `src/lib/closer-statuses.ts`

**Wijzigen**
- DB-migratie: enum uitbreiden + 2 tabellen + RLS + validatietrigger
- `src/types/database.ts` (AppRole)
- `src/App.tsx` (route)
- `src/components/layout/AppSidebar.tsx` (menu-item)
- `src/pages/UserManagementPage.tsx` (rol-config)
- `src/pages/DashboardPage.tsx` (closer-redirect)
- `src/components/leads/SELeadsList.tsx` (afspraak-badge)
- `supabase/config.toml` (`verify_jwt = false` voor calendly-webhook)
- Memory-index: nieuwe entry "Closer Role & Calendly CRM"

Geen nieuwe deps.

## Risico's / aandachtspunten

- **Round-robin met 1 closer** = altijd Luuk. Geen probleem, schaalt vanzelf zodra je meer closers toevoegt.
- **Caller_se_id matching**: als Calendly hidden field ontbreekt, valt afspraak in "onbekende caller". Edge function logt dit en plaatst hem alsnog in CRM van round-robin closer met `caller_sales_executive_id = null`.
- **Webhook signing key vergeten** = webhook accepteert alles. We vragen de key bij oplevering en weigeren tot dan unsigned requests met een duidelijke 401.
