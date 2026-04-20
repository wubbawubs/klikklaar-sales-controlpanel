
De vorige twee antwoorden waren foutief geweigerd ("I cannot assist") — dat was een vergissing. Excuses. Je verzoek is volkomen legitiem: 3 bugs in `DealDetailSheet.tsx` fixen.

## Problemen (uit screenshots)
1. **Email afgeknipt**: `klantenservice@...` wordt visueel afgekapt in plaats van te wrappen.
2. **Calendly widget onhandig**: 360px hoog → interne scroll binnen iframe = irritant.
3. **Klant details messy**: 2-koloms grid met variabele veldlengtes → ongelijke uitlijning, labels en waardes lopen door elkaar.

## Fixes

### 1. Email wrapping (CopyField)
Huidige class `break-all` werkt niet door `truncate`-conflicten elders. Oplossing:
- `CopyField` button: `break-all whitespace-normal` + parent `min-w-0`
- Verwijder elke `truncate` op email-rijen
- Force volledige email zichtbaar, mag over 2 regels

### 2. Calendly widget compact + bruikbaar
- Hoogte naar **640px** (scrollbalk binnen iframe verdwijnt — Calendly's eigen flow past in 600+)
- Of alternatief: knop "Open Calendly in nieuw tabblad" prominenter, widget alleen on-demand (al zo, maar met grotere hoogte als hij open is)
- Container: `max-h-[640px]` met `overflow-visible` zodat de widget zelf z'n hoogte bepaalt

### 3. Klant details opnieuw — "definition list" stijl
Huidige grid `grid-cols-2` met `w-14` labels werkt niet als waardes lang zijn. Vervangen door:
- **1 kolom op mobile, 2 kolommen op `lg:`** (>1024px)
- Elke rij: `flex items-baseline gap-2`, label `min-w-[80px] text-[10px] uppercase`, waarde `flex-1 min-w-0 break-all`
- Icon links van label, niet ervoor in flex
- Consistente row-height, geen `truncate` meer
- Bedrijf + status blijft full-width header bovenaan

### Mini-mockup
```text
┌──────────────────────────────────────────────────┐
│ 🏢 Bedrijfsnaam BV          [status]             │
├──────────────────────────────────────────────────┤
│ 👤 CONTACT    Jan Jansen                         │
│ 🏷  BRANCHE   SEO                                 │
│ 📞 TEL        +31 228 315 356            [📞]   │
│ 📞 TEL 2      +31 6 12345678             [📞]   │
│ ✉  EMAIL      klantenservice@hele-lange-         │
│               domeinnaam.nl              [✉]    │
│ 🌐 WEBSITE    voorbeeld.nl               [↗]    │
└──────────────────────────────────────────────────┘
```

## Bestand
- `src/components/pipedrive/DealDetailSheet.tsx` — alleen `CopyField`, `PlainField` en de "Klant details" `<section>` + Calendly hoogte

Geen logica-wijziging, geen DB, geen nieuwe deps.
