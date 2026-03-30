

# Plan: Interactieve Deal Cards + Lead Details + Call Logging Verrijking

## Samenvatting

Drie verbeteringen zodat Huub tijdens het bellen alle informatie direct bij de hand heeft:

1. **Klikbare deal cards in de Kanban** — opent een detailpaneel met organisatie-info, contactpersonen, deal-waarde en laatste notities/activiteiten uit Pipedrive
2. **Klikbare leads in het CRM/dashboard** — zelfde detailweergave wanneer je op een lead klikt
3. **Verrijkte Call Logging** — bij het selecteren van een lead worden alle Pipedrive-gegevens (organisatie, contacten, eerdere notities, deals) getoond voordat de call wordt gelogd

---

## Wat er verandert voor Huub

- In de **Pipedrive Kanban** (`/pipedrive` → Pipeline tab): klik op een deal card → een **Sheet/Drawer** schuift open met:
  - Deal titel, waarde, verwachte sluitdatum
  - Organisatie-details (adres, eigenaar, aantal deals)
  - Contactpersonen met telefoon en e-mail (direct klikbaar)
  - Laatste 10 activiteiten/notities uit Pipedrive

- In het **CRM leads overzicht** (`/pipedrive` → Mijn CRM tab): klik op een lead-rij → zelfde detailpaneel met organisatie + contacten + activiteiten

- In **Call Logging** (`/calls`): wanneer een lead wordt geselecteerd uit de dropdown, verschijnt een **informatiekaart** onder de selector met:
  - Organisatie-info en alle contactpersonen
  - Laatste 5 activiteiten/notities
  - Openstaande deals voor die organisatie
  - Pas daarna de call-resultaten invullen

---

## Technische aanpak

### 1. Nieuw component: `DealDetailSheet.tsx`
- Herbruikbaar Sheet (sidebar drawer) component
- Props: `dealId`, `orgId`, `personId`, `open`, `onOpenChange`
- Bij openen: parallel 3 edge functions aanroepen:
  - `pipedrive-organizations?org_id=X` → org details + personen
  - `pipedrive-activities?org_id=X` → laatste activiteiten/notities
  - `pipedrive-deals?org_ids=X` → alle deals voor die org
- Toont alles in een gestructureerd paneel

### 2. Aanpassing `PipedriveFunnel.tsx` (Kanban)
- `DealCard` component krijgt `onClick` → opent `DealDetailSheet`
- Cursor wordt `pointer`, visuele hover-feedback

### 3. Aanpassing `SalesExecutiveCRM.tsx` (Leads tab)
- Elke lead-rij wordt klikbaar → opent `DealDetailSheet` met de `org_id` van die lead
- De bestaande "Log" knop blijft naast de klik-functionaliteit

### 4. Aanpassing `CallLoggingPage.tsx`
- Nieuw component `LeadInfoPanel` dat verschijnt zodra een lead geselecteerd wordt
- Haalt org-details, contacten en recente activiteiten op via dezelfde edge functions
- Toont dit als een uitklapbare kaart boven het call-formulier

### 5. Geen database- of edge function wijzigingen nodig
- Alle benodigde endpoints bestaan al (`pipedrive-organizations`, `pipedrive-persons`, `pipedrive-activities`, `pipedrive-deals`)
- Geen migraties nodig

---

## Bestanden

| Bestand | Actie |
|---|---|
| `src/components/pipedrive/DealDetailSheet.tsx` | Nieuw — herbruikbaar detailpaneel |
| `src/components/pipedrive/LeadInfoPanel.tsx` | Nieuw — informatiekaart voor call logging |
| `src/components/integrations/PipedriveFunnel.tsx` | Wijzigen — deal cards klikbaar maken |
| `src/components/pipedrive/SalesExecutiveCRM.tsx` | Wijzigen — lead rijen klikbaar maken |
| `src/pages/CallLoggingPage.tsx` | Wijzigen — LeadInfoPanel toevoegen |

