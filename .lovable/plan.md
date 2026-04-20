
## Doel
Detail-sheet wordt een complete, compacte lead-cockpit waar alles zichtbaar is, alles kopieerbaar is, en Calendly correct prefilled.

## 1. Lead-info: alles tonen wat we hebben
Uitbreiden met velden die nu nog ontbreken:
- **Deal**: `dealTitle`, `dealValue` (eur), `dealExpectedClose`
- **Toegewezen op**: `assigned_at`
- **Productlijn**: `product_line`
- **Notes**: prominenter
- **Pipedrive extra emails/phones**: alle entries van `persons[0]`
- Compacte 2-koloms grid (`label | waarde`) ipv huidige rijen-stijl

## 2. Klikgedrag in details = kopiëren
- Telefoon/email/website in details-blok → klik = `clipboard.writeText` + toast "Gekopieerd"
- Naast elk veld kleine secundaire icon-knop (Phone/Mail/ExternalLink) voor wie écht wil bellen/mailen/openen
- Tab-flow: alle velden `tabIndex={0}`, Enter = kopieer

In de **lijst** blijven `PhoneCell`/`WebsiteCell` ongewijzigd (PC=kopieer, mobiel=bel).

## 3. Calendly prefill correct krijgen
Probleem: `name` blijft leeg, `a1` belandt verkeerd. Oorzaak: URL-params werken alleen voor `name`+`email`, custom questions vereisen Calendly's embed-script.

**Oplossing**: Calendly widget-script lazy-laden via CDN, initiëren met:
```js
Calendly.initInlineWidget({
  url: CALENDLY_URL,
  prefill: { name, email, customAnswers: { a1: phone, a2: website } }
})
```
(a1 = "Op welk nummer...", a2 = "Op welke website..." — match met vraag-volgorde uit screenshot).

Fallback: als script faalt → link "Open Calendly".

## 4. Compactere layout
- Lead-info: 2-koloms grid, `p-2.5`, kleinere gaps
- Tussen secties: `space-y-3` ipv `space-y-5`
- Calendly-iframe: 480px

## 5. Bel-historie blijft
Lokaal calls-blok onderaan, ongewijzigd.

## Bestanden
| Bestand | Wijziging |
|---|---|
| `src/components/pipedrive/DealDetailSheet.tsx` | Lead-info uitbreiden, CopyableField intern, Calendly script-widget, compactere layout |
| `src/components/leads/SELeadsList.tsx` | `assignedAt`, `dealValue` doorgeven |

Geen DB-migratie. Geen nieuwe libraries.
