
Probleem: min-w-[1100px] forceert horizontale scroll op kleinere viewports. User wil geen scroll, wel ademruimte tussen kolommen.

Oplossing in `src/components/leads/SELeadsList.tsx`:
- Verwijder `min-w-[1100px]` van Table
- Verwijder vaste pixel-widths (`w-[110px]`, `w-[180px]` etc.) — die dwingen min-breedtes af
- Gebruik proportionele/auto-sizing met `whitespace-nowrap` op headers + cellen die niet mogen wrappen
- Spacing via consistente horizontale padding op alle TableHead/TableCell (bv. `px-4`) ipv `pr-8`
- "Laatste actie" header op één regel (`whitespace-nowrap`) zodat hij niet meer breekt naar 2 regels
- Bedrijf-kolom mag flex-groeien (geen width), Branche kolom truncate met max-w

Resultaat: tabel vult de beschikbare breedte, kolommen ademen evenredig, geen horizontale scroll, headers blijven netjes op 1 regel.

Bestand: `src/components/leads/SELeadsList.tsx` — alleen header/cell className aanpassingen, geen logica.
