
# Styling Refresh, Tussenronde

Pure visuele opschoning, geen business logic verandert. Beide thema's (light + dark) worden in één klap aangescherpt. Scope blijft bewust klein zodat we snel kunnen schakelen.

## Wat er verandert

### 1. Topbar rechtsboven opruimen
- **Avatar/profielrondje weg** uit de topbar. Account, wachtwoord, profielfoto en uitloggen zijn al bereikbaar via de sidebar footer, dus dubbel.
- **Notificatiebel verhuist van sidebar naar topbar rechts**, op de plek waar nu de avatar zit. Logischer, altijd zichtbaar (ook als sidebar ingeklapt is), en geeft de donkere sidebar visueel rust.
- Topbar krijgt een subtiele bottom-border in plaats van de huidige harde lijn, en iets meer ademruimte (`h-14` consistent).
- `UserAccountMenu.tsx` wordt verwijderd uit `AppLayout.tsx` (component blijft bestaan voor evt. later, maar wordt niet meer gerenderd).

### 2. Sidebar polish
- Brand header: notificatiebel eruit, alleen logo + titels. Iets minder padding zodat het compacter oogt.
- Active nav-item: i.p.v. `bg-sidebar-primary/15` een nettere left-accent bar (2px teal links) + zachte achtergrond. Voelt meer als een echt admin platform (Linear/Vercel-stijl).
- Iconen krijgen consistente `h-[18px]` en `stroke-width=2`.
- User footer: avatar-bolletje strakker (kleur uit teal palette i.p.v. grijs), "Uitloggen" en thema-toggle als nette icon-buttons naast elkaar i.p.v. tekst-links.

### 3. Closer Kanban opfrissen
Dit is de pagina die je nu open hebt en die er volgens jou lelijk uit ziet.
- **Kolommen**: huidige `bg-muted/40` blokken worden vervangen door een lichtere card-style met subtiele border en gekleurde topbalk per status (2px streep in de status-tone). Geeft direct visuele scheiding tussen kolommen.
- **Kolomtitel**: kleine gekleurde dot + label in status-kleur, count-badge rechts in `bg-background` met border (i.p.v. solid pill).
- **Cards**: 
  - Iets meer padding (`p-3.5`), `rounded-xl`, zachte shadow op hover i.p.v. alleen border-color change.
  - Org-naam grotere weight, contact eronder als secundaire regel.
  - Datum/tijd icoontjes in `text-muted-foreground/70`.
  - Deal-bedrag krijgt een eigen pill rechts onderin i.p.v. losse groene tekst.
  - Stale-badge (`2d`, `5d`) blijft, maar in nieuwe stijl (rounded-md, kleinere padding, consistent met andere badges).
  - "Bel" en "Mail" worden echte mini-buttons met border i.p.v. tekstlinks.
- **Lege kolom**: gestreepte placeholder met icon i.p.v. cursief "Leeg".
- **Drag state**: kolom krijgt `bg-primary/5` + `ring-1 ring-primary/20`, card krijgt `shadow-elevated` + lichte schaal i.p.v. rotate (rotate voelt speels, te casual).

### 4. Page header op /closer
- Huidige header (icon-tegel + titel) wordt strakker: kleinere icon-tegel, titel `text-page` (al gedefinieerd in tailwind config), subtitel `text-sm text-muted-foreground`. Rechts ernaast komt een count "X afspraken in pipeline".

### 5. Light + Dark theme finetuning in `index.css`
Minimale tweaks aan de design tokens, geen kleurenrevolutie:
- **Light**: `--background` iets warmer/witter (`210 20% 98%`), `--card` blijft puur wit, `--border` iets zachter (`220 13% 92%`). Geeft minder grijs-op-grijs gevoel.
- **Dark**: `--background` iets dieper (`220 22% 8%`), `--card` (`220 20% 12%`), `--muted` (`220 16% 14%`). Hogere contrast tussen card en achtergrond zodat kanban-kolommen pop'en.
- Sidebar tokens blijven gelijk (navy is on-brand).
- Shadow tokens al goed in tailwind config, hergebruiken.

### 6. Quick wins overal
- Cards in app gebruiken consistent `shadow-card` op rust en `shadow-card-hover` op hover (al gedefinieerd, alleen toepassen waar nu niks staat).
- `animate-fade-in` op kanban kolommen zodat het bij refresh iets minder stilstaat.

## Wat NIET verandert
- Geen wijzigingen in routes, auth, data-fetching, drag-and-drop logica, notificatie-functionaliteit zelf, of email/cron flows.
- `UserAccountMenu` component wordt niet verwijderd, alleen niet meer gerenderd in topbar.
- Geen nieuwe pagina's of features.

## Bestanden die worden aangepast
- `src/components/layout/AppLayout.tsx` — avatar weg, topbar netter
- `src/components/layout/AppSidebar.tsx` — bel naar topbar, active state strakker, footer polish
- `src/components/closer/CloserKanban.tsx` — kolomstijl, drag state, lege state
- `src/components/closer/AppointmentCard.tsx` — card refresh
- `src/pages/CloserCRMPage.tsx` — header polish + count
- `src/index.css` — light/dark token tweaks
- (optioneel) `src/components/pwa/NotificationBell.tsx` — alleen kleurklassen aanpassen zodat hij goed staat op licht én donker (nu is hij gestyled voor donkere sidebar)

## Vervolg (later, niet nu)
- Dezelfde polish toepassen op `/leads`, `/dashboard`, `/evaluaties` zodra je akkoord bent met de richting hier op `/closer`.
