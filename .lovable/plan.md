

# Lead Scraper - Implementatieplan

## Samenvatting
Lead scraper bouwen met Tavily Search API (op basis van de key die je hebt gedeeld) en Lovable AI (Gemini) voor het extraheren van contactgegevens. Admins kunnen zoeken op branche + regio en resultaten direct als leads importeren.

## Stappen

### 1. Tavily API Key opslaan
- Opslaan als secret `TAVILY_API_KEY` in de backend

### 2. Edge Function `lead-scraper`
- Ontvangt zoekopdracht (bijv. "interieur designer Enkhuizen")
- Tavily Search API (`api.tavily.com/search`) met `search_depth: "advanced"` en `include_raw_content: true`
- Stuurt gescrapete content naar Gemini AI voor extractie van bedrijfsnaam, telefoonnummer, email, website
- Retourneert array van gestructureerde leads
- Max 10 resultaten per zoekopdracht

### 3. Frontend: Scraper tab op Lead Management pagina
- Nieuwe tab "Scraper" in `LeadManagementPage.tsx`
- Invoervelden: zoekopdracht + regio/stad
- "Zoeken" knop start de scrape
- Preview-tabel met resultaten (bedrijf, telefoon, email, website)
- Checkbox selectie + SE-kiezer voor directe toewijzing
- Deduplicatie-check tegen bestaande leads op org_name
- Import als `pipedrive_lead_assignments` met status `assigned`

### 4. Database
- Geen nieuwe tabellen nodig, resultaten gaan direct in bestaande `pipedrive_lead_assignments`

## Technische details

**Bestanden aangemaakt:**
- `supabase/functions/lead-scraper/index.ts`

**Bestanden gewijzigd:**
- `src/pages/LeadManagementPage.tsx` (scraper tab toevoegen)
- `supabase/config.toml` (function config)

**API Flow:**
Tavily Search (10 URLs + content) → Gemini Flash (JSON extractie) → Preview UI → Database insert

