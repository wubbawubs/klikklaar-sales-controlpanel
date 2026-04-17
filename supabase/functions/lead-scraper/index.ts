import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TavilyResult {
  url: string;
  title?: string;
  content?: string;
  raw_content?: string;
}

async function tavilySearch(apiKey: string, query: string, maxResults: number): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      include_raw_content: true,
      max_results: Math.min(maxResults, 20),
    }),
  });
  if (!res.ok) {
    console.error(`Tavily search failed for "${query}":`, res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return data.results || [];
}

// Firecrawl: deep-scrape a URL (renders JS, follows contact links)
async function firecrawlScrape(apiKey: string, url: string): Promise<string> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: false, // we want footers (telefoon staat vaak in footer)
        waitFor: 1500,
      }),
    });
    if (!res.ok) {
      console.warn(`Firecrawl ${url} failed: ${res.status}`);
      return "";
    }
    const data = await res.json();
    const md = data?.data?.markdown || data?.markdown || "";
    return typeof md === "string" ? md.slice(0, 4000) : "";
  } catch (e) {
    console.warn(`Firecrawl ${url} error:`, e);
    return "";
  }
}

// Try common contact page paths in addition to root
function contactCandidates(rootUrl: string): string[] {
  try {
    const u = new URL(rootUrl);
    const origin = u.origin;
    return [
      origin + "/contact",
      origin + "/contact/",
      origin + "/contactgegevens",
      origin + "/contact-us",
      origin + "/over-ons",
      origin + "/about",
      origin + "/kontakt",
      origin,
    ];
  } catch {
    return [rootUrl];
  }
}

// Robust NL phone regex (covers 06-, 0XX-, +31, with/without spaces/dashes/parens)
const PHONE_REGEX = /(\+31[\s\-]?\(?0?\)?[\s\-]?[1-9]\d[\s\-]?\d{6,7}|0[1-9]\d{1,2}[\s\-]?\d{6,7}|06[\s\-]?\d{8})/g;

function extractPhonesFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(PHONE_REGEX) || [];
  // Normalize: strip spaces/dashes for dedup, keep first formatted version
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const norm = m.replace(/[\s\-\(\)]/g, "");
    if (norm.length < 9) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(m.trim());
  }
  return out;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
function extractEmailsFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".webp")) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(m);
  }
  return out;
}

async function deepScrapeForContact(apiKey: string, rootUrl: string): Promise<string> {
  const candidates = contactCandidates(rootUrl);
  let combined = "";
  let foundPhone = false;
  // Scrape up to 3 candidates in parallel for speed, stop early if phone found
  const firstBatch = candidates.slice(0, 3);
  const results = await Promise.all(firstBatch.map(u => firecrawlScrape(apiKey, u)));
  for (let i = 0; i < results.length; i++) {
    const md = results[i];
    if (!md) continue;
    combined += `\n\n[PAGE: ${firstBatch[i]}]\n` + md;
    if (PHONE_REGEX.test(md)) {
      foundPhone = true;
      PHONE_REGEX.lastIndex = 0; // reset global regex state
    }
  }
  // If still no phone, try root as last resort
  if (!foundPhone && !firstBatch.includes(rootUrl)) {
    const rootMd = await firecrawlScrape(apiKey, rootUrl);
    if (rootMd) combined += `\n\n[PAGE: ${rootUrl}]\n` + rootMd;
  }
  return combined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, max_results = 20 } = await req.json();

    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Zoekopdracht is te kort" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");
    if (!TAVILY_API_KEY) {
      return new Response(JSON.stringify({ error: "TAVILY_API_KEY niet geconfigureerd" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY niet geconfigureerd" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      console.warn("FIRECRAWL_API_KEY missing — skipping deep scrape");
    }

    const target = Math.min(Math.max(max_results, 5), 50);

    // Step 1: Multi-query Tavily search for broader coverage
    const baseQuery = query.trim();
    const queries = [
      `${baseQuery} telefoon contact`,
      `${baseQuery} bellen offerte`,
      `${baseQuery} bedrijf contactgegevens`,
      `${baseQuery} site:linkedin.com OR site:kvk.nl`,
    ];

    console.log(`Running ${queries.length} Tavily queries for: "${baseQuery}" (target ${target})`);

    const perQuery = Math.ceil(target / 2);
    const searchResults = await Promise.all(
      queries.map(q => tavilySearch(TAVILY_API_KEY, q, perQuery))
    );

    // Deduplicate by URL hostname, skip aggregator/directory sites for deep-scrape phase
    const SKIP_HOSTS = /(linkedin\.com|kvk\.nl|facebook\.com|instagram\.com|google\.com|youtube\.com|telefoonboek\.nl|oozo\.nl|infoisinfo\.nl|bedrijvenregister\.nl|detelefoongids\.nl)$/i;
    const seen = new Set<string>();
    const allResults: TavilyResult[] = [];
    for (const batch of searchResults) {
      for (const r of batch) {
        try {
          const host = new URL(r.url).hostname.replace(/^www\./, "");
          if (seen.has(host)) continue;
          seen.add(host);
          allResults.push(r);
        } catch {
          // skip invalid URLs
        }
      }
    }

    console.log(`Pooled ${allResults.length} unique sites from ${searchResults.flat().length} raw results`);

    if (allResults.length === 0) {
      return new Response(JSON.stringify({ leads: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sitesForAi = allResults.slice(0, Math.min(target * 2, 30));

    // Step 2: Firecrawl deep-scrape contact pages in parallel (skip aggregators)
    let firecrawlEnriched = 0;
    if (FIRECRAWL_API_KEY) {
      const scrapeTargets = sitesForAi.filter(r => {
        try { return !SKIP_HOSTS.test(new URL(r.url).hostname); } catch { return false; }
      });
      console.log(`Firecrawl deep-scraping ${scrapeTargets.length} sites for contact info...`);
      // Run in batches of 5 to avoid overload
      const BATCH = 5;
      for (let i = 0; i < scrapeTargets.length; i += BATCH) {
        const slice = scrapeTargets.slice(i, i + BATCH);
        const scraped = await Promise.all(
          slice.map(r => deepScrapeForContact(FIRECRAWL_API_KEY, r.url))
        );
        slice.forEach((r, idx) => {
          if (scraped[idx]) {
            // Append Firecrawl content to the raw_content for richer extraction
            r.raw_content = (r.raw_content || "") + "\n\n[CONTACT PAGE]\n" + scraped[idx];
            firecrawlEnriched++;
          }
        });
      }
      console.log(`Firecrawl enriched ${firecrawlEnriched} sites with contact-page content`);
    }

    // Step 3: Build content blocks
    const contentBlocks = sitesForAi.map((r, i) => {
      const content = (r.raw_content || r.content || "").slice(0, 4000);
      return `--- Website ${i + 1} ---\nURL: ${r.url}\nTitle: ${r.title || ""}\nContent:\n${content}`;
    }).join("\n\n");

    // Step 4: Gemini AI extraction via Lovable AI Gateway
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Je bent een data-extractie assistent voor B2B lead generation. Extraheer per uniek bedrijf:
- org_name: bedrijfsnaam (verplicht)
- phone: telefoonnummer (Nederlands formaat, bijv. 06-12345678 of 020-1234567)
- email: e-mailadres
- website: website URL (root domein)

KRITIEK BELANGRIJK:
- Zoek AGRESSIEF naar telefoonnummers in de content (kijk naar patronen zoals 06-, 0XX-, +31, "T:", "Tel:", "Bel:")
- Let extra goed op het [CONTACT PAGE] gedeelte, daar staat vaak het echte nummer
- Een bedrijf zonder telefoon EN zonder email is waardeloos, sla die over
- Geef voorrang aan bedrijven MET telefoonnummer
- Dedupliceer strikt op bedrijfsnaam (negeer hoofdletters/spaties)
- Retourneer minimaal ${Math.min(target, 15)} en maximaal ${target} bedrijven indien beschikbaar
- Alleen bedrijven echt relevant voor: "${baseQuery}"`,
          },
          {
            role: "user",
            content: `Zoekopdracht: "${baseQuery}"\n\n${contentBlocks}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_leads",
              description: "Extract structured lead data from website content",
              parameters: {
                type: "object",
                properties: {
                  leads: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        org_name: { type: "string" },
                        phone: { type: ["string", "null"] },
                        email: { type: ["string", "null"] },
                        website: { type: ["string", "null"] },
                      },
                      required: ["org_name"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["leads"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_leads" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI Gateway error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit bereikt, probeer later opnieuw" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits op, voeg credits toe in workspace instellingen" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI extractie mislukt" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    let leads: any[] = [];

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        leads = parsed.leads || [];
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    // Final dedup by org_name (case-insensitive)
    const dedupedMap = new Map<string, any>();
    for (const lead of leads) {
      if (!lead?.org_name) continue;
      const key = lead.org_name.toLowerCase().trim();
      const existing = dedupedMap.get(key);
      // Prefer entries with phone numbers
      if (!existing || (!existing.phone && lead.phone)) {
        dedupedMap.set(key, lead);
      }
    }
    const finalLeads = Array.from(dedupedMap.values()).slice(0, target);

    console.log(`Extracted ${finalLeads.length} unique leads (${finalLeads.filter(l => l.phone).length} with phone)`);

    return new Response(JSON.stringify({ leads: finalLeads }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lead-scraper error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
