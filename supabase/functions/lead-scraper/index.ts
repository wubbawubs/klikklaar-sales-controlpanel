import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SKIP_HOSTS_RE = /(linkedin\.com|kvk\.nl|facebook\.com|instagram\.com|youtube\.com|telefoonboek\.nl|oozo\.nl|infoisinfo\.nl|bedrijvenregister\.nl|detelefoongids\.nl|yelp\.com|werkspot\.nl|trustoo\.nl|starofservice\.nl|cylex\.nl|opiness\.com|marktplaats\.nl|bol\.com|google\.com|maps\.google\.com)$/i;

const PHONE_REGEX = /(\+31[\s\-]?\(?0?\)?[\s\-]?[1-9]\d[\s\-]?\d{6,7}|0[1-9]\d{1,2}[\s\-]?\d{6,7}|06[\s\-]?\d{8})/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function extractPhonesFromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(PHONE_REGEX) || [];
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

// Firecrawl Search — returns Google-style results, optionally with scraped markdown
async function firecrawlSearch(apiKey: string, query: string, limit: number): Promise<any[]> {
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: Math.min(limit, 20),
        lang: "nl",
        country: "nl",
        scrapeOptions: { formats: ["markdown"] },
      }),
    });
    if (!res.ok) {
      console.warn(`Firecrawl search "${query}" failed: ${res.status} ${await res.text()}`);
      return [];
    }
    const data = await res.json();
    // v2 returns { success, data: { web: [...], ... } } OR { data: [...] }
    const web = data?.data?.web || data?.data || data?.web || [];
    return Array.isArray(web) ? web : [];
  } catch (e) {
    console.warn(`Firecrawl search error:`, e);
    return [];
  }
}

// Firecrawl Scrape (used for Google Maps + website recovery)
async function firecrawlScrape(apiKey: string, url: string, opts: { waitFor?: number; onlyMain?: boolean } = {}): Promise<string> {
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
        onlyMainContent: opts.onlyMain ?? false,
        waitFor: opts.waitFor ?? 1500,
      }),
    });
    if (!res.ok) {
      console.warn(`Firecrawl scrape ${url} failed: ${res.status}`);
      return "";
    }
    const data = await res.json();
    const md = data?.data?.markdown || data?.markdown || "";
    return typeof md === "string" ? md : "";
  } catch (e) {
    console.warn(`Firecrawl scrape ${url} error:`, e);
    return "";
  }
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY niet geconfigureerd" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    if (!FIRECRAWL_API_KEY) {
      return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY niet geconfigureerd" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const target = Math.min(Math.max(max_results, 5), 50);
    const baseQuery = query.trim();

    // Step 1: Google Maps scrape (gestandaardiseerde business cards met telefoon)
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(baseQuery)}`;
    console.log(`Scraping Google Maps: ${mapsUrl}`);
    const mapsMarkdownPromise = firecrawlScrape(FIRECRAWL_API_KEY, mapsUrl, { waitFor: 3000, onlyMain: false });

    // Step 2: Firecrawl Search met meerdere queries parallel
    const queries = [
      `${baseQuery} telefoon contact`,
      `${baseQuery} bellen offerte`,
      `${baseQuery} bedrijf contactgegevens`,
    ];
    console.log(`Running ${queries.length} Firecrawl searches for: "${baseQuery}"`);
    const searchPromise = Promise.all(
      queries.map(q => firecrawlSearch(FIRECRAWL_API_KEY, q, Math.ceil(target / 2)))
    );

    const [mapsMarkdown, searchBatches] = await Promise.all([mapsMarkdownPromise, searchPromise]);

    console.log(`Maps markdown: ${mapsMarkdown.length} chars`);

    // Dedup search results by hostname, skip directories
    const seenHosts = new Set<string>();
    const webResults: { url: string; title?: string; description?: string; markdown?: string }[] = [];
    for (const batch of searchBatches) {
      for (const r of batch) {
        const url = r.url || r.link;
        if (!url) continue;
        try {
          const host = new URL(url).hostname.replace(/^www\./, "");
          if (SKIP_HOSTS_RE.test(host)) continue;
          if (seenHosts.has(host)) continue;
          seenHosts.add(host);
          webResults.push({
            url,
            title: r.title,
            description: r.description || r.snippet,
            markdown: r.markdown || r?.scrape?.markdown || "",
          });
        } catch { /* skip */ }
      }
    }
    console.log(`Web hits: ${webResults.length} unique business sites`);

    if (mapsMarkdown.length === 0 && webResults.length === 0) {
      return new Response(JSON.stringify({ leads: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sitesForAi = webResults.slice(0, Math.min(target * 2, 25));

    // Step 3: AI extractie — Maps markdown + web snippets samen
    const mapsBlock = mapsMarkdown
      ? `=== GOOGLE MAPS RESULTATEN (PRIMAIRE BRON) ===\n${mapsMarkdown.slice(0, 20000)}\n\n`
      : "";
    const webBlock = sitesForAi.map((r, i) => {
      const content = (r.markdown || r.description || "").slice(0, 4000);
      return `--- Website ${i + 1} ---\nURL: ${r.url}\nTitle: ${r.title || ""}\nContent:\n${content}`;
    }).join("\n\n");

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
- phone: telefoonnummer (NL formaat, bijv. 06-12345678 of 020-1234567 of 0299 366788)
- email: e-mailadres
- website: website URL (root domein, GEEN directories zoals telefoonboek.nl, yelp.com, facebook.com)

KRITIEK BELANGRIJK:
- De GOOGLE MAPS RESULTATEN sectie bevat business cards in de vorm "Naam | rating | type | adres | telefoon". Pak die EERST en EXACT over.
- Telefoonnummers in Maps zien er vaak uit als "0299 366 788" of "06 16019485" — neem ze ALTIJD over.
- Daarna aanvullen met websites uit de Web-sectie (match op bedrijfsnaam).
- Sla bedrijven ZONDER telefoon over tenzij er een email of website is.
- Dedupliceer strikt op bedrijfsnaam (negeer hoofdletters/spaties).
- NOOIT directory/aggregator domeinen als website opnemen.
- Retourneer maximaal ${target} bedrijven, alleen relevant voor: "${baseQuery}".`,
          },
          {
            role: "user",
            content: `Zoekopdracht: "${baseQuery}"\n\n${mapsBlock}=== WEBSITES ===\n${webBlock}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_leads",
              description: "Extract structured lead data",
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
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits op" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI extractie mislukt" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    let leads: any[] = [];
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        leads = JSON.parse(toolCall.function.arguments).leads || [];
      }
    } catch (e) {
      console.error("Failed to parse AI response:", e);
    }

    // Dedup + filter directory websites
    const dedupedMap = new Map<string, any>();
    for (const lead of leads) {
      if (!lead?.org_name) continue;
      // Strip directory websites
      if (lead.website) {
        try {
          const host = new URL(lead.website.startsWith("http") ? lead.website : `https://${lead.website}`)
            .hostname.replace(/^www\./, "");
          if (SKIP_HOSTS_RE.test(host)) lead.website = null;
        } catch { lead.website = null; }
      }
      const key = lead.org_name.toLowerCase().trim();
      const existing = dedupedMap.get(key);
      if (!existing || (!existing.phone && lead.phone)) {
        dedupedMap.set(key, lead);
      }
    }
    let finalLeads = Array.from(dedupedMap.values()).slice(0, target);

    // Step 4: Recovery — scrape websites van leads zonder telefoon
    const needRecovery = finalLeads.filter(l => !l.phone && l.website);
    if (needRecovery.length > 0) {
      console.log(`Recovery scrape voor ${needRecovery.length} leads zonder telefoon`);
      const BATCH = 5;
      for (let i = 0; i < needRecovery.length; i += BATCH) {
        const slice = needRecovery.slice(i, i + BATCH);
        const scraped = await Promise.all(
          slice.map(l => {
            const url = l.website.startsWith("http") ? l.website : `https://${l.website}`;
            return firecrawlScrape(FIRECRAWL_API_KEY, url, { waitFor: 1500, onlyMain: false });
          })
        );
        slice.forEach((l, idx) => {
          const md = scraped[idx];
          if (!md) return;
          if (!l.phone) {
            const phones = extractPhonesFromText(md);
            if (phones[0]) l.phone = phones[0];
          }
          if (!l.email) {
            const emails = extractEmailsFromText(md);
            try {
              const host = new URL(l.website.startsWith("http") ? l.website : `https://${l.website}`)
                .hostname.replace(/^www\./, "");
              const onDomain = emails.find(e => e.toLowerCase().endsWith(`@${host}`));
              const generic = emails.find(e => /^(info|contact|hallo|hello)@/i.test(e));
              l.email = onDomain || generic || emails[0] || null;
            } catch { l.email = emails[0] || null; }
          }
        });
      }
    }

    const withPhone = finalLeads.filter(l => l.phone).length;
    const pct = finalLeads.length > 0 ? Math.round((withPhone / finalLeads.length) * 100) : 0;
    console.log(`Maps cards parsed | Web hits: ${webResults.length} | Final: ${finalLeads.length} | With phone: ${withPhone} (${pct}%)`);

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
