# Ontwerp: CRM bijwerken vanuit een meetingtranscript

Datum: 3 november 2026
Aangevraagd door: Robin (eigenaar), gebruikt door Robin en collega

## Waarom

Elke week is er een sales-update-meeting waarin veel klanten en deals langskomen. Die meeting wordt opgenomen met Plaud.ai, dat er een transcript van maakt. Daarna moet iemand het CRM per deal bijwerken (statussen, fases, notities). Dat kost veel tijd. Het doel is dat het CRM na de meeting snel weer klopt.

## Wat het doet

1. Een gebruiker plakt het Plaud-transcript (of een andere lange tekst, zoals een gespreksverslag) in een tekstvak in het CRM.
2. De AI leest het transcript naast de huidige CRM-gegevens en stelt per besproken klant wijzigingen voor.
3. De gebruiker loopt de voorstellen langs: aanvinken, aanpassen of weggooien.
4. Pas na "Toepassen" wordt het CRM bijgewerkt. Er gebeurt nooit iets automatisch.

## Soorten voorstellen

Per klant of deal kan de AI voorstellen:

- **Fase wijzigen** (`deals.stage_id`), bijvoorbeeld van Voorstel naar Onderhandeling
- **Gewonnen of verloren**, met `lost_reason` bij verloren (via de gewonnen- of verloren-fase, met dezelfde logica als slepen in de pipeline: `stage_change`-activiteit en webhook `deal.stage_changed`)
- **Notitie** toevoegen aan de deal-tijdlijn (`deal_activities`, type `note`)
- **Waarde wijzigen** (`deals.value_eur`) als er een bedrag genoemd wordt
- **Eigenaar wijzigen** (`deals.assigned_to`) als expliciet gezegd wordt dat iemand de deal overneemt
- **Opvolgafspraak inplannen** (`crm_appointments`) als er een concrete actie met dag of datum genoemd wordt, bijvoorbeeld "belt vrijdag terug"
- **Nieuw bedrijf met deal** als een besproken klant nog niet in het CRM staat (bedrijf, eventueel contactpersoon, deal in een fase)

Bij elk voorstel staat het stukje transcript waar het op gebaseerd is, zodat de gebruiker het snel kan controleren.

## Wie

- Iedereen met CRM-toegang in de organisatie mag een transcript plakken en de voorstellen toepassen.
- Wie plakt, keurt ook goed. Er is geen goedkeuring per verkoper.

## Belangrijkste regel: liever een fout dan iets verkeerd

De gebruiker zei letterlijk: "liever een error en handmatig dan dat er dingen anders gaan staan." Daaruit volgt:

- **Twijfel over de klant:** als de AI niet zeker weet welke klant bedoeld wordt (meerdere bedrijven met een vergelijkbare naam, of alleen een voornaam), kiest hij niet zelf. Het voorstel wordt gemarkeerd als "kies klant" en kan pas worden toegepast als de gebruiker een klant kiest of "nieuw bedrijf" selecteert.
- **Geen gegokte waarden:** waarde, datum en eigenaar worden alleen voorgesteld als ze expliciet genoemd worden. Een vaag "begin volgende week" wordt een notitie, geen afspraak met een verzonnen datum.
- **Twijfel over de deal** *(mijn keuze)*: een voorstel hoort bij een deal, niet bij een bedrijf. Heeft het bedrijf precies één open deal, dan koppelt de AI daaraan. Zijn er meerdere open deals, of geen enkele terwijl er wel een fase of waarde genoemd wordt, dan wordt het "kies deal" en blokkeert het net als "kies klant".
- **Deal al gewonnen of verloren** *(mijn keuze)*: een fasewijziging op zo'n deal krijgt een duidelijke waarschuwing en moet de gebruiker apart bevestigen.
- **Opvolgafspraak zonder tijd** *(mijn keuze)*: bij "belt vrijdag terug" stelt de AI een afspraak voor op die dag, maar het tijdstip blijft leeg. Het voorstel kan pas worden toegepast als de gebruiker een tijd invult. Type (bellen of meeting) en eigenaar worden vooraf ingevuld met de deal-eigenaar en "bellen", tenzij er iets anders gezegd wordt, en zijn zichtbaar aan te passen. Zonder concrete dag wordt het een notitie.
- **Verouderde voorstellen:** bij het toepassen wordt gecontroleerd of de deal sinds de analyse niet al is aangepast (fase, waarde of eigenaar is anders dan waar het voorstel van uitging). Zo ja, dan wordt dat voorstel niet toegepast en ziet de gebruiker een duidelijke melding.
- **Fouten zijn zichtbaar:** per voorstel is te zien of het gelukt of mislukt is. Een mislukt voorstel blijft staan zodat de gebruiker het opnieuw kan proberen of met de hand kan doen. Er wordt nooit stilletjes iets overgeslagen.
- **Als de AI-analyse zelf faalt** (time-out, ongeldig antwoord), krijgt de gebruiker een foutmelding en blijft het transcript bewaard. Er komen dan geen halve resultaten.

## Spoor achteraf

- Elke toegepaste wijziging komt in de deal-tijdlijn, zodat zichtbaar is dat het uit de meeting van [datum] kwam en wie het heeft toegepast.
- Elke wijziging wordt ook in `audit_logs` gezet met de situatie ervoor en erna.
- *(Mijn keuze)* Het transcript, de voorstellen en hun status (open, toegepast, weggegooid, mislukt) worden bewaard in een eigen tabel. Daardoor kun je een half afgewerkte meeting later afmaken en terugzien wat er bij welke meeting is veranderd.

## Hoe het gebouwd wordt (mijn keuzes)

- Een nieuwe pagina in het CRM, bijvoorbeeld "Meeting verwerken", en een lijst met eerdere verwerkte meetings.
- Een nieuwe edge function die via de bestaande Lovable AI Gateway (`LOVABLE_API_KEY`) werkt, met tool-calling voor gestructureerde uitvoer, zoals `lead-scraper` dat al doet. Dat betekent geen nieuwe accounts of sleutels. Model: een sterk model (bijvoorbeeld `google/gemini-2.5-pro`), omdat nauwkeurigheid hier belangrijker is dan snelheid.
- De AI krijgt mee: de lijst van bedrijven en open deals (naam, fase, waarde, eigenaar), de fases van de organisatie, de teamleden en de datum van de meeting (voor "vrijdag" en dergelijke).
- Het toepassen gebeurt per voorstel in een edge function (of een SECURITY DEFINER-RPC) aan de serverkant. Die controleert of de gebruiker lid is van de organisatie, voert de wijziging uit, schrijft de tijdlijn en `audit_logs`, en vuurt dezelfde webhook (`deal.stage_changed`) af als de pipeline. *(Mijn keuze: alleen admins mogen in `audit_logs` schrijven, en dat is bewust zo dichtgezet. Die beveiliging blijft dus staan.)*
- Bij gewonnen of verloren worden ook `won_at`, `lost_at` en `lost_reason` gezet. Dat doet de pipeline nu niet. De gewonnen- en verloren-fase worden op naam herkend, net als in `useMoveDeal`.
- Het Nederlands is de taal van de interface en van de notities.

## Buiten scope

- Automatisch ophalen uit Plaud (koppeling of API). Plakken is genoeg.
- Audio uploaden of zelf transcriberen.
- Wijzigingen aan de oude SE/closer-flow (`closer_appointments`, Pipedrive-tabellen). Dit werkt alleen op de CRM-deals.
- Nieuwe velden aan deals toevoegen, zoals "volgende stap".
- Automatisch toepassen zonder controle.

## Wat de bouwer zelf mag invullen

- De precieze schermindeling van de controlelijst.
- Hoe de bedrijvenlijst aan de AI wordt meegegeven als die groot wordt.
- De naamgeving van de nieuwe tabel en de function.
- Testopzet, volgens de bestaande Vitest-setup.

## Let op

- De CRM-tabellen staan niet in de gegenereerde `types.ts`; bestaande hooks gebruiken `as any`.
- Er staan drie niet-gecommitte migraties in de repo (`20260702000001-3_*_knowledge.sql`). Die horen niet bij deze klus en moeten niet worden aangeraakt.
