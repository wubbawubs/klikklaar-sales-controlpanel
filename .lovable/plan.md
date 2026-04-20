

# Plan — Excel-werkbaarheid in /leads

## 1. Telefoon & website cellen (Excel-tab-flow)
**Nieuwe component `ContactCells.tsx`** met 2 tabbare cellen per rij:
- **Telefoon-cel** (`tabIndex={0}`): toont nummer als focusbare button.
  - Desktop (`!isMobile`) → klik/Enter = `navigator.clipboard.writeText` + toast "Gekopieerd"
  - Mobiel (iOS/Android) → klik/Enter = `window.location.href = 'tel:...'` (werkt op Safari)
  - Detection: `useIsMobile()` hook (bestaat al)
- **Website-cel** (`tabIndex={0}`): toont domein als focusbare button → klik/Enter = `window.open(url, '_blank')`

**Tab-volgorde**: alle andere cellen krijgen `tabIndex={-1}`. Per rij telt alleen `[telefoon, website]`. Native browser-Tab gaat automatisch naar volgende rij's telefoon-cel. Geen custom keyboard-handler nodig — pure HTML `tabIndex` doet dit.

**Sneltoetsen 1-6 blijven werken** op de gefocuste rij (we leiden de rij af uit `document.activeElement.closest('tr')`). Na een log-actie via `1-6` → `nextRow.querySelector('[data-phone-cell]').focus()` zodat focus direct naar volgende lead's telefoon springt.

## 2. Geen gehoor → 1 werkdag (was 2)
In `QuickCallActions.tsx` regel 122: `addBusinessDays(new Date(), 2)` → `addBusinessDays(new Date(), 1)`. Eén-regel wijziging.

## 3. Nieuwe outcome: "Ongeldig nummer"
- Type uitbreiden: `QuickOutcome` krijgt `'invalid_number'`.
- Sneltoets `7` → `invalid_number`.
- Outcome-mapping: `invalid_number` → assignment status `'invalid'`.
- `AttemptIndicator` toont rode `XCircle` + "Ongeldig" bij `last_outcome = invalid_number`.
- `StatusBadge`: voeg `invalid` toe (rood, label "Ongeldig nummer").
- Quick-filter `"Ongeldig"` toegevoegd, en standaard verborgen uit hoofdlijst.

## 4. "Geen interesse" verbergen + Mail Export tab
**Verbergen uit hoofdlijst**: `SELeadsList` filtert standaard leads uit waar `status = 'lost'` (geen interesse).

**Nieuwe tab "Mail export"** in `LeadManagementPage.tsx` (naast "Mijn leads"):
- Toont alle leads met `status = 'lost'` van de SE
- Kolommen: Bedrijf | Contact | Email | Telefoon | "Geen interesse op" datum | Actie
- Knoppen: 
  - **"Exporteer CSV"** (selectie of alles) → genereert CSV met email/naam/bedrijf/datum, klaar voor mail-tool
  - **"Terugzetten naar bel-lijst"** per rij → status terug naar `assigned` (alleen tonen als `>4 weken` sinds `updated_at`; daaronder disabled met tooltip "Beschikbaar over X dagen")

Geen webhook-implementatie nu — CSV-export volstaat als eerste stap. Webhook-veld kan later toegevoegd worden zonder schemawijziging (CSV is al de payload-structuur).

**Geen DB-migratie nodig**: `status = 'lost'` bestaat al, `updated_at` ook. De 4-wekenregel is pure UI-logica.

## Bestanden

| Bestand | Wijziging |
|---|---|
| `src/components/leads/ContactCells.tsx` | **Nieuw** — tabbare telefoon + website cellen met smart copy/call/open |
| `src/components/leads/SELeadsList.tsx` | Vervang telefoon/website kolommen door `ContactCells`, hide `lost`, sneltoets `7`, focus-volgende-rij na log |
| `src/components/leads/QuickCallActions.tsx` | `addBusinessDays(…, 1)`, nieuwe outcome `invalid_number` |
| `src/components/leads/AttemptIndicator.tsx` | Toon "Ongeldig" voor `invalid_number` |
| `src/components/ui/status-badge.tsx` | Voeg `invalid` + `lost` labels toe |
| `src/pages/LeadManagementPage.tsx` | Tabs "Mijn leads" / "Mail export" |
| `src/components/leads/MailExportList.tsx` | **Nieuw** — geen-interesse leads, CSV-export, 4-weken terugzet-regel |

Geen database-migratie. Geen nieuwe tabel. Bestaande `calls` outcome `invalid_number` wordt simpelweg een nieuwe waarde — Postgres `text` kolom accepteert dit.

