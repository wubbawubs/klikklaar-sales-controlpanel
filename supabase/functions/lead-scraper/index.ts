import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, max_results = 10 } = await req.json();

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

    // Step 1: Tavily Search
    console.log(`Searching Tavily for: "${query}" (max ${max_results})`);
    const searchQuery = `${query} telefoon contact`;
    const tavilyRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: searchQuery,
        search_depth: "advanced",
        include_raw_content: true,
        max_results: Math.min(max_results, 10),
      }),
    });

    if (!tavilyRes.ok) {
      const errText = await tavilyRes.text();
      console.error("Tavily error:", tavilyRes.status, errText);
      return new Response(JSON.stringify({ error: "Zoeken mislukt: " + tavilyRes.status }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tavilyData = await tavilyRes.json();
    const results = tavilyData.results || [];
    console.log(`Tavily returned ${results.length} results`);

    if (results.length === 0) {
      return new Response(JSON.stringify({ leads: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Build content blocks for AI extraction
    const contentBlocks = results.map((r: any, i: number) => {
      const content = (r.raw_content || r.content || "").slice(0, 3000);
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
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Je bent een data-extractie assistent. Extraheer uit de gegeven websiteinhoud de volgende gegevens per bedrijf:
- org_name: bedrijfsnaam
- phone: telefoonnummer (Nederlands formaat als mogelijk)
- email: e-mailadres
- website: website URL

Regels:
- Retourneer ALLEEN bedrijven die relevant zijn voor de zoekopdracht
- Als een veld niet gevonden is, gebruik null
- Dedupliceer op bedrijfsnaam
- Maximaal ${max_results} resultaten`,
          },
          {
            role: "user",
            content: `Zoekopdracht: "${query}"\n\n${contentBlocks}`,
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
                        org_name: { type: "string", description: "Company name" },
                        phone: { type: ["string", "null"], description: "Phone number" },
                        email: { type: ["string", "null"], description: "Email address" },
                        website: { type: ["string", "null"], description: "Website URL" },
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

    console.log(`Extracted ${leads.length} leads`);

    return new Response(JSON.stringify({ leads }), {
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
