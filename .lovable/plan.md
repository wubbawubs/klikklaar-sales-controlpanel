

# Health Check & Downtime Eliminator Engine

## Wat wordt er gebouwd

Een continu draaiend health-monitoring systeem dat op de achtergrond alle kritieke processen van de SE-omgeving bewaakt. Bij fouten ontvang jij (admin/coach) direct een e-mail en wordt de fout gelogd. De SE ziet een subtiele statusbalk op het dashboard.

---

## Architectuur

```text
┌─────────────────────────────────────────┐
│  SE Dashboard (browser)                 │
│                                         │
│  useHealthCheck() hook                  │
│  - Elke 60s: checks uitvoeren          │
│  - Bij fout → POST health-alert        │
│  - Statusbalk bovenaan dashboard        │
└──────────────┬──────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Edge Function: health-alert             │
│  - Ontvangt foutmelding + context        │
│  - Logt in health_events tabel           │
│  - Stuurt e-mail via Resend (of log)     │
│  - Deduplicatie: max 1 mail/30min/type   │
└──────────────────────────────────────────┘
```

---

## Stappen

### 1. Database: `health_events` tabel
Nieuwe tabel voor het loggen van health check resultaten:
- `id`, `sales_executive_id`, `check_type` (pipedrive_sync, ci_engine, supabase_connectivity, edge_functions), `status` (ok/warning/critical), `error_message`, `error_code`, `suggested_fix`, `created_at`, `notified` (boolean)
- RLS: SE's kunnen eigen events lezen, admins alles

### 2. Edge Function: `health-alert`
- Ontvangt: `seId`, `seName`, `checkType`, `errorMessage`, `errorCode`
- Deduplicatie: checkt of dezelfde `check_type` + `sales_executive_id` al gemeld is in laatste 30 min
- Logt in `health_events`
- Stuurt e-mail naar admin (hergebruikt Resend-patroon van `notify-coach`)
- Genereert `suggested_fix` op basis van bekende foutcodes

### 3. Client-side: `useHealthCheck` hook
Draait elke 60 seconden de volgende checks:
1. **Supabase connectivity** — simpele `SELECT 1` query
2. **Pipedrive sync status** — check `pipedrive_lead_assignments.updated_at` niet ouder dan 20 min (alleen employees)
3. **CI Engine beschikbaarheid** — ping `ci-coaching` functie met lege body
4. **Edge Functions** — basis connectivity test naar `signal-engine`

Bij een falende check → `supabase.functions.invoke('health-alert', ...)` met foutdetails.

### 4. Dashboard: `SEHealthBar` component
- Subtiele statusbalk bovenaan het SE-dashboard (onder de welkomstbanner)
- Groen "Alle systemen operationeel" als alles ok is
- Oranje/rood bij waarschuwingen met korte beschrijving
- Automatisch vernieuwd door de hook

### 5. Integratie in `SEPersonalDashboard.tsx`
- `useHealthCheck(seId, isEmployee)` hook toevoegen
- `<SEHealthBar>` component renderen boven de performance bars

---

## Technische details

- **Deduplicatie**: voorkomt e-mailstorm bij aanhoudende fouten — max 1 notificatie per 30 min per check-type per SE
- **Suggested fixes**: mapping van bekende errors (bijv. `PIPEDRIVE_API_TOKEN not set` → "Controleer de Pipedrive API token in de instellingen")
- **E-mail**: hergebruikt het bestaande Resend-patroon uit `notify-coach`
- **Geen extra secrets nodig**: RESEND_API_KEY is al beschikbaar (of fallback naar console log)

