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
      origin,
    ];
  } catch {
    return [rootUrl];
  }
}

async function deepScrapeForContact(apiKey: string, rootUrl: string): Promise<string> {
  const candidates = contactCandidates(rootUrl);
  for (const u of candidates) {
    const md = await firecrawlScrape(apiKey, u);
    // If we find any phone-like pattern, return immediately
    if (/(\+31|0[1-9][\s\-]?\d{1,3}[\s\-]?\d{6,7}|06[\s\-]?\d{8})/.test(md)) {
      return md;
    }
  }
  // Fallback: return last attempt content (root)
  return await firecrawlScrape(apiKey, rootUrl);
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

    const perQuery = Math.ceil(target / 2); // overshoot to allow dedup
    const searchResults = await Promise.all(
      queries.map(q => tavilySearch(TAVILY_API_KEY, q, perQuery))
    );

    // Deduplicate by URL hostname
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

    // Cap content sites for AI extraction (token limits)
    const sitesForAi = allResults.slice(0, Math.min(target * 2, 40));

    // Step 2: Build content blocks
    const contentBlocks = sitesForAi.map((r, i) => {
      const content = (r.raw_content || r.content || "").slice(0, 2500);
      return `--- Website ${i + 1} ---\nURL: ${r.url}\nTitle: ${r.title || ""}\nContent:\n${content}`;
    }).join("\n\n");

    // Step 3: Gemini AI extraction via Lovable AI Gateway
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
