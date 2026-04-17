

## Wat ik zie

Google's lokale resultaten ("Sites voor plaatsen" + de Maps cards) bevatten precies wat we willen: bedrijfsnaam + nummer + adres direct zichtbaar (Wooncentrum Veerman 0299 366 788, Sanne 06 16019485, Marloes 06 11203904, Made in Holland 06 10108152, etc).

Tavily geeft ons die Google Maps/Places data NIET — Tavily indexeert losse websites en mist juist de Maps-sidebar. Daarom zien we 35% hit-rate.

## Echte root cause

We gebruiken de verkeerde bron. Telefoonnummers vinden we niet door 13 random websites te scrapen, maar door **Google Maps / Places** als primaire bron te gebruiken. Daar staat per bedrijf gegarandeerd: naam, telefoon, adres, website.

## Voorgestelde oplossing — Google Places als primaire bron

### Nieuwe pipeline

```text
1. Firecrawl Search   → Google-style results met snippets (vaak incl. nummers)
2. Firecrawl Scrape   → Google Maps zoek-URL voor de query
                         → extract alle business cards (naam/tel/adres/website)
3. Merge + dedup      → op bedrijfsnaam
4. Firecrawl Scrape   → website van bedrijven zonder telefoon (recovery)
5. Regex fallback     → laatste vangnet voor nummers/emails
```

### Concrete wijzigingen `lead-scraper/index.ts`

1. **Vervang Tavily search door Firecrawl Search** (`/v2/search` met `scrapeOptions: { formats: ['markdown'] }`). Firecrawl Search levert Google-resultaten inclusief de lokale pack en business snippets — dat is precies wat we missen.
2. **Voeg Google Maps scrape toe**: scrape `https://www.google.com/maps/search/{query}` met Firecrawl (`onlyMainContent: false`, `waitFor: 2500`). Maps rendert business cards met telefoon zichtbaar in de DOM.
3. **Parse business cards** uit de Maps-markdown met een gestructureerde Gemini-call die nummer + adres direct uit Maps-blocks haalt (hoge hit-rate omdat Maps gestandaardiseerd is).
4. **Behoud regex fallback** voor websites waar nog geen nummer gevonden is.
5. **Behoud SKIP_HOSTS hard block** uit vorige iteratie.

### Kosten / snelheid
- Firecrawl Search: 1 call per query (4 queries → 4 credits).
- Maps scrape: 1 extra call per zoekopdracht.
- Website deep-scrape: alleen voor leads zónder nummer (i.p.v. allemaal) → minder credits dan nu.
- Netto: vergelijkbaar of goedkoper, veel hogere hit-rate.

### Verwacht resultaat
Met Google Maps als primaire bron verwachten we 85-95% telefoonnummer-vangst, omdat Maps het nummer gegarandeerd toont voor verified businesses. Voor jouw zoekopdracht "interieur design Enkhuizen" zien we in jouw screenshot zelf al 4/4 nummers in de Maps-sectie.

## Bestanden

| Bestand | Wijziging |
|---|---|
| `supabase/functions/lead-scraper/index.ts` | Tavily → Firecrawl Search + Maps scrape + selectieve website-recovery |
| `.lovable/plan.md` | Plan-update naar nieuwe architectuur |

## Verificatie
Na deploy zoeken op `interieur design enkhuizen` en in de logs checken: `Maps cards: X | Web hits: Y | Final with phone: Z (≥75%)`.

