# Finance-dashboard in de CRM — ontwerp

Datum: 2026-11-19
Repo: `klikklaar-sales-controlpanel` (sales.klikklaarseo.nl)
Status: goedgekeurd 2026-11-19

## Waarom

De leiding en aandeelhouders van OneGroup moeten financieel kunnen zien waar elk bedrijf staat
(de "leidster" van finance-control). Nu staat dat verspreid over twee plekken die allebei niet goed
zijn:

- **finance-control** (`onegroup-finance-control`, eigen Lovable/Supabase-project): de opzet en
  indeling zijn grotendeels goed, maar de cijfers worden per maand met de hand ingevoerd en een deel
  draait nog op mockdata (Prognose, Stripe).
- **De finance-sectie in de CRM** (`/finance`): een rommelige mix van deals, deal-fees, Stripe en een
  bunq-koppeling. Die gaat weg.

Doel: één finance-module in de CRM, op de opzet van finance-control, met de feedbacklijst verwerkt en
met **live cijfers uit Exact Online** in plaats van handwerk.

Succes = leiding en aandeelhouders kijken wekelijks naar het overzicht, en niemand hoeft nog cijfers
over te typen.

## Doelen

1. Finance zit in de CRM, alleen zichtbaar voor gebruikers met de Finance-toegang.
2. Per gebruiker per bedrijf toegang aan/uit zetten.
3. Alle bedrijven waarin OneGroup aandelen heeft (= alle Exact-administraties) zitten erin.
4. Cijfers komen uit Exact Online: omzet, kosten, resultaat, banksaldi, debiteuren, crediteuren.
5. Eén samenvatting, alleen op Overzicht; de andere pagina's herhalen die niet.
6. Abonnementen/vaste lasten worden bijgehouden, met een melding bij een nieuwe.
7. Eén rapport (A4/PDF) om uit te delen bij overleg.

## Niet in deze versie (non-goals)

- **Facturen vanuit het dashboard aanmaken in Exact** (tweerichting). Kan via de Exact API; wordt een
  apart vervolgproject zodra de leeskoppeling draait. Dan bespreken: wie mag aanmaken, goedkeurstap.
- **"Vraag het je cijfers" / AI-assistent à la Swoep.** De gebruiker moet nog navragen wat er aan
  Swoep aansprak. Omdat de cijfers in onze eigen database staan, kan dit later zonder herbouw.
- **Omzetverwachting** (op basis van pipeline/contracten). De forecast is een cashprognose (zie
  Cash & Liquiditeit). Omzet heeft de target als richtpunt.
- **Automatisch mailen van het rapport.** Alleen een exportknop.
- **Directe ING-koppeling.** ING wordt in Exact gekoppeld (instelling bij de gebruiker, geen bouwwerk).
- Deals & Offertes, Contracten, Stripe, Groepsdashboard, Top open deals: gaan uit finance.

## Anti-goals (zou een mislukking zijn, ook als het "werkt")

- Een gebruiker ziet cijfers van een bedrijf waar hij geen toegang toe heeft, langs welke weg dan ook
  (pagina, API, PDF, groepstotaal, melding).
- Cijfers die oud zijn zonder dat het te zien is.
- Weer handmatig maandcijfers moeten invoeren.
- De sales-kant van de CRM (deals, deal-fees, Growth) gaat stuk of verliest data.

## Constraints

- **Stack:** de CRM (React + Vite + TanStack Query + shadcn/ui + Supabase, Lovable-gekoppeld). Bouwen
  binnen deze repo en zijn Supabase-project. Pushes naar de gekoppelde branch syncen naar Lovable:
  branch werkend houden, geen gepubliceerde history herschrijven.
- **Exact Online API:** OAuth2 (authorization code). Er moet een app geregistreerd worden in het Exact
  App Center; iemand met toegang tot alle administraties autoriseert één keer. Access tokens zijn kort
  geldig (≈10 min), refresh tokens roteren. Rate limits per administratie (orde: 60 calls/min,
  enkele duizenden per dag) — de builder controleert de actuele waarden. Daarom: periodiek
  synchroniseren, niet live per klik.
- **Bestaande CRM-tabellen** die nu door finance gebruikt worden: `invoices`, `cash_positions`,
  `company_financials`, `contracts`, `bunq_state`, Stripe-functie. `can_view_finance()` wordt ook door
  `growth_goals` (Growth-pagina) gebruikt — Growth moet blijven werken zoals nu (admins).
  `deals` / `deal_fees` blijven: die horen bij sales.
- **Taal UI:** Nederlands, zoals de rest van de CRM.

## Aanpak (gekozen)

Overwogen:

- **A. Eigen Exact-koppeling, cijfers gesynchroniseerd naar eigen finance-tabellen** — gekozen.
  Snel, toegang per bedrijf afdwingbaar in de database (RLS), historie voor prognose en vergelijking
  met vorig jaar, en dezelfde koppeling dient later voor het aanmaken van facturen. Nadeel: OAuth,
  tokens en rate limits zelf bouwen.
- **B. Via een unified accounting API (Chift/Codat).** Minder koppelwerk, maar extra partij met
  financiële data, maandabonnement, en afhankelijk van hun mogelijkheden voor schrijven. Niet nodig:
  alles zit in Exact.
- **C. Live uit Exact per paginabezoek.** Loopt tegen rate limits, traag, geen RLS op de data,
  prognose/historie lastig. Afgevallen.
- finance-control los laten en vanuit de CRM linken: tegen de wens "in de CRM, één gebruikersbeheer".

## Ontwerp

### Toegang

- **Finance-toegang** is een extra vlag op een gebruiker, los van de gewone rol (`super_admin`,
  `admin`, `coach`, `sales_executive`). Zonder die vlag: geen menu-item, routes geblokkeerd, en RLS
  geeft niets terug.
- **Per gebruiker per finance-bedrijf** een aan/uit-toegang. Alle data (pagina's, groepstotalen,
  rapport, meldingen) is beperkt tot de bedrijven die aan staan. Groepstotalen = som van de zichtbare
  bedrijven.
- **Beheer:** alleen `super_admin`, in de bestaande gebruikersbeheerpagina: per gebruiker de
  Finance-vlag plus een vinkje per bedrijf.
- Nieuwe administraties uit Exact verschijnen automatisch als bedrijf, maar niemand behalve
  `super_admin` heeft er toegang toe tot een super_admin het aanzet. Een bedrijf kan op Bedrijven
  ook **uitgesloten** worden (bv. een slapende administratie of een die niet van OneGroup is): dan
  wordt hij niet meer gesynchroniseerd en telt hij nergens mee. *(keuze Claude)*
- **Twee niveaus op de Finance-vlag: kijken en beheren.** Kijken = alles lezen voor de bedrijven
  die aan staan. Beheren = daarnaast voor die bedrijven aandeel %, target en buffer aanpassen en
  vaste lasten toevoegen/wijzigen (en daarmee de melding triggeren). Gebruikersbeheer en
  bedrijfstoegang blijven alleen voor `super_admin`. *(voorstel Claude, akkoord gebruiker)*
- **Geen finance-only gebruikers in deze versie.** Alleen bestaande CRM-gebruikers krijgen
  Finance-toegang. Externe aandeelhouders met een account dat alleen finance ziet (eigen startpagina,
  sales-data afgeschermd) is een vervolgstap. *(keuze Claude; vraag stond open bij de gebruiker)*
- **`super_admin` ziet altijd alle bedrijven** en heeft altijd Finance-toegang. Alle anderen alleen via
  de vlag + expliciete bedrijfstoegang. Bij livegang hebben alleen super_admins toegang; zij zetten
  de rest aan. Gewone `admin`s verliezen dus de huidige /finance-toegang tot ze aangezet worden.
  *(keuze Claude)*
- Afdwingen in de database (RLS + security-definer helpers), niet alleen in de UI. Exact-tokens en
  syncstatus zijn nooit leesbaar voor clients (service-role only).

### Databron en sync

- Eén Exact-verbinding (één login met toegang tot alle administraties). Elke administratie = één
  finance-bedrijf.
- Een geplande achtergrondtaak (Supabase edge function + schema, bv. elk uur) haalt per
  administratie op:
  - grootboeksaldi per periode → omzet, kosten, resultaat per maand (dit jaar en vorig jaar);
  - banksaldi per bankrekening (bankdagboek/grootboek) + datum van de laatste verwerkte
    afschriftregel;
  - openstaande verkoopfacturen (debiteuren) met klant, bedrag, vervaldatum;
  - openstaande inkoopfacturen (crediteuren) met vervaldatum;
  - inkoopfacturen per leverancier (voor "echt betaald" bij vaste lasten).
- Plus een knop "Nu verversen" (met rate-limit-bescherming).
- **Er is nog geen Exact-app/toegang.** Bouwen tegen de Exact-documentatie, met de koppeling achter
  een duidelijke grens zodat hij los te testen is. Voor lokaal bekijken draait het dashboard op
  demo-data in dezelfde tabellen die de sync vult. De echte koppeling wordt geverifieerd zodra
  iemand de Exact-app heeft aangemeld en geautoriseerd; tot die tijd is de Exact-sync "gebouwd,
  niet geverifieerd".
- Elke pagina toont wanneer de cijfers voor het laatst uit Exact zijn bijgewerkt; een bedrijf waarvan
  de sync faalt of de bank-afschriften oud zijn, wordt zichtbaar gemarkeerd.
- Welke Exact-endpoints precies (bv. ReportingBalance, ReceivablesList/PayablesList, bank entries) en
  hoe omzet/kosten op grootboekrekeningen worden ingedeeld: aan de builder, te verifiëren tegen de
  Exact-documentatie en een echte administratie.

### Handmatige gegevens (Exact heeft ze niet)

Per bedrijf, in te vullen op Bedrijven:
- aandeelpercentage OneGroup;
- omzettarget per maand;
- minimumbuffer (voor de prognose).

Plus de lijst **abonnementen & vaste lasten** (naam, bedrijf, bedrag per maand, categorie,
optioneel gekoppelde Exact-leverancier). Elke last hoort bij **precies één bedrijf**: een gedeelde
last staat bij het bedrijf dat hem betaalt, net als in Exact. Geen "alle bedrijven" en geen verdeling.
*(keuze Claude)*

**Eenmalige overname uit finance-control:** bedrijven (naam, aandeel %), omzettargets en de
**terugkerende** vaste lasten uit het finance-control Supabase-project worden overgenomen en aan de
juiste Exact-administratie gekoppeld. Eenmalige kosten uit finance-control worden niet overgenomen
(die staan al in Exact). Merken (`brands`) worden niet overgenomen; de koppeling bedrijf ↔
administratie gebeurt bij de overname handmatig/bevestigd, niet automatisch op naam. Leestoegang tot
het finance-control-project regelt de gebruiker bij de start van de bouw. Gebruikers en hun
bedrijfskoppelingen: zie Toegang. *(keuze Claude)*

**Groepstotalen zijn een optelsom zonder intercompany-eliminatie**, net als in finance-control, met
die vermelding ("excl. intercompany") zichtbaar bij groepstotalen. Eliminatie is een mogelijk
vervolg. *(keuze Claude)*

### Pagina's

Menu onder Finance: **Overzicht · Omzet & Resultaat · Cash & Liquiditeit · Facturen & Debiteuren ·
Bedrijven · Rapportage.** Overal een bedrijfsfilter en een schakelaar **100% / aandeel OneGroup**
(vermenigvuldigt bedragen met het aandeelpercentage — vervangt het Groepsdashboard).

**Overzicht** (gekozen layout B uit de mockup):
1. Vijf kerncijfers: banksaldo; omzet deze maand vs target; omzet YTD (vs vorig jaar); resultaat YTD
   (marge); open debiteuren (waarvan te laat).
2. Grafiek: omzet deze maand tegenover target, per bedrijf (vervangt "Cash per bedrijf").
3. Een kaart per bedrijf: bank, resultaat YTD, open debiteuren / te laat, gezondheidsstip.
Geen "Top open deals". De samenvatting staat alleen hier.

**Omzet & Resultaat:** inhoudelijk als finance-control (was goed), met Exact-cijfers: omzet, kosten en
resultaat per maand per bedrijf, vergelijking met vorig jaar en met target.

**Cash & Liquiditeit:**
- Prognose banksaldo 13 weken = banksaldo nu + open debiteuren op vervaldatum − open crediteuren op
  vervaldatum − vaste lasten per maand; rode lijn = minimumbuffer. (Hoe te late debiteuren meetellen:
  aan de builder, zichtbaar uitgelegd in de UI.)
- Banksaldo per bedrijf/rekening met datum laatste afschrift (rood als oud).
- Abonnementen & vaste lasten met "+ Nieuwe maandlast", bedrag p/m en "echt betaald" uit Exact
  (afwijking gemarkeerd); totaal vaste lasten en runway.

**Facturen & Debiteuren:** openstaande verkoopfacturen uit Exact per bedrijf (klant, bedrag,
vervaldatum, dagen te laat), filter "te laat". Alleen lezen.

**Bedrijven:** lijst van alle Exact-administraties met de handmatige velden (aandeel %, target per
maand, minimumbuffer) en syncstatus. Bewerken door super_admin (en wie verder schrijfrecht krijgt —
zie open punten builder).

**Rapportage:** kies groep of één bedrijf en een maand → één A4 met banksaldi, omzet van de maand vs
target, 13-wekenprognose (grafiek), open debiteuren en wat te laat is. Knop "Download PDF". Respecteert
dezelfde bedrijfstoegang. Geen rapportregistratie/verzendstatus.

### Melding nieuwe maandlast

Bij het toevoegen van een abonnement/vaste last: een melding (bestaande `notifications`-tabel; push
waar de CRM dat al doet) naar alle gebruikers met Finance-toegang tot dat bedrijf, bv.
"Robin heeft een nieuwe maandlast toegevoegd: HubSpot Sales Pro, € 450 p/m." Kosten die op "alle"
bedrijven staan: melding naar iedereen met Finance-toegang.

### Wat er uit de CRM verdwijnt

- Huidige `/finance`-pagina's: FinancePage, Facturen, Omzet & Resultaat, Liquiditeit, Contracten,
  Stripe, Prognose, en de FinanceLayout zoals hij is.
- bunq-koppeling (`bunq-sync`, `bunq_state`) en de Stripe-functie in finance.
- Finance-tabellen die vervangen worden (`invoices`, `cash_positions`, `company_financials`,
  `contracts` voor zover alleen finance ze gebruikt): eerst nagaan dat niets anders ze leest; data
  die ertoe doet niet weggooien zonder check.
- Blijft: `deals`, `deal_fees`, Growth (`growth_goals`, blijft admin-only).

## Bijlage: oorspronkelijke feedbacklijst

- In CRM met specifieke add-on rol → Finance dan zichtbaar, anders niet
- Cash per bedrijf → moet worden target tegenover omzet
- Top open deals eruit
- Groepsoverzicht zelfde als Overzicht → samenvatting op Overzicht wel houden
- Alle bedrijven waar aandelen in zitten erin hangen
- Samenvatting op 1 pagina, niet op iedere pagina alles herhalen
- Omzet en resultaat is goed
- Toegang per bedrijf per user aan/uit kunnen zetten ("toekomst ook kunnen hangen aan 1 user")
- Lijstje abonnementen in Cash & Liquiditeit
- Koppeling API Exact voor facturen en debiteuren
- Kan het 2 kanten op? Factuur in finance doordrukken naar Exact → vervolgproject
- Rapportage → 1 overzicht uitdraagbaar met bankstanden, omzet huidige maand, forecast, openstaande
  debiteuren
- Bedrijvenoverzicht houden, de rest van commercial kan eruit
- Melding bij nieuwe maandelijkse kosten

Mockups (richting, geen pixel-spec): `docs/superpowers/specs/2026-11-19-finance-mockups/`.

## Aan de builder

- Datamodel en naamgeving van de nieuwe finance-tabellen; of finance-bedrijven gekoppeld worden aan
  CRM-`organizations`.
- Exacte Exact-endpoints, grootboekindeling naar omzet/kosten, syncfrequentie binnen de rate limits,
  token-opslag en -rotatie.
- Hoe te late debiteuren in de prognose meetellen (uitleggen in de UI).
- PDF-techniek (bv. print-stylesheet of client-side PDF).
- Volgorde van opruimen van oude tabellen/functies.
- Visuele uitwerking binnen de huidige CRM-stijl; mockups (Overzicht B, Cash & Liquiditeit) staan als
  richting, niet als pixel-spec.
