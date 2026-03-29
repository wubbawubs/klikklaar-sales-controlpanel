import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { sales_executive_id } = await req.json();
    if (!sales_executive_id) throw new Error("sales_executive_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // ── Gather SE context ──────────────────────────────
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .split("T")[0];
    const monthAgo = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .split("T")[0];

    const [seRes, callsRes, leadsRes, activitiesRes, eodRes, signalsRes] =
      await Promise.all([
        supabase
          .from("sales_executives")
          .select("full_name, first_name, employment_type")
          .eq("id", sales_executive_id)
          .single(),
        supabase
          .from("calls")
          .select("outcome, created_at, duration_seconds")
          .eq("sales_executive_id", sales_executive_id)
          .gte("created_at", `${weekAgo}T00:00:00`),
        supabase
          .from("pipedrive_lead_assignments")
          .select("status, deal_title, org_name, updated_at")
          .eq("sales_executive_id", sales_executive_id),
        supabase
          .from("pipedrive_activities")
          .select("activity_type, done, due_date, outcome, subject")
          .eq("sales_executive_id", sales_executive_id)
          .gte("created_at", `${weekAgo}T00:00:00`),
        supabase
          .from("eod_submission_data")
          .select(
            "day_score, energy_score, calls_attempted, real_conversations, appointments_set, deals_closed, good_things, blocker_text, work_date"
          )
          .ilike(
            "employee_name",
            `%${
              (seRes as any)?.data?.first_name ||
              sales_executive_id.slice(0, 4)
            }%`
          )
          .gte("work_date", monthAgo)
          .order("work_date", { ascending: false })
          .limit(7),
        supabase
          .from("signals")
          .select("signal_type, severity, title, description")
          .eq("sales_executive_id", sales_executive_id)
          .eq("resolved", false)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    const seName =
      seRes.data?.full_name || seRes.data?.first_name || "Sales Executive";
    const calls = callsRes.data || [];
    const leads = leadsRes.data || [];
    const activities = activitiesRes.data || [];
    const eods = eodRes.data || [];
    const signals = signalsRes.data || [];

    // ── Compute stats ──────────────────────────────────
    const totalCalls = calls.length;
    const notReached = calls.filter(
      (c) => c.outcome === "not_reached"
    ).length;
    const interest = calls.filter((c) => c.outcome === "interest").length;
    const appointments = calls.filter(
      (c) => c.outcome === "appointment"
    ).length;
    const deals = calls.filter((c) => c.outcome === "deal").length;
    const convRate =
      totalCalls > 0
        ? Math.round(
            ((interest + appointments + deals) / totalCalls) * 100
          )
        : 0;

    const leadsByStatus: Record<string, number> = {};
    for (const l of leads) {
      leadsByStatus[l.status] = (leadsByStatus[l.status] || 0) + 1;
    }

    const openActivities = activities.filter((a) => !a.done).length;
    const doneActivities = activities.filter((a) => a.done).length;

    const avgDayScore =
      eods.length > 0
        ? Math.round(
            (eods.reduce((s, e) => s + (e.day_score || 0), 0) / eods.length) *
              10
          ) / 10
        : null;
    const avgEnergy =
      eods.length > 0
        ? Math.round(
            (eods.reduce((s, e) => s + (e.energy_score || 0), 0) /
              eods.length) *
              10
          ) / 10
        : null;

    const recentBlockers = eods
      .filter((e) => e.blocker_text)
      .map((e) => e.blocker_text)
      .slice(0, 3);
    const recentGood = eods
      .filter((e) => e.good_things)
      .map((e) => e.good_things)
      .slice(0, 3);

    // ── Build prompt ───────────────────────────────────
    const dataContext = `
SALES EXECUTIVE: ${seName}

WEEK STATISTIEKEN (afgelopen 7 dagen):
- Totaal calls: ${totalCalls}
- Niet bereikt: ${notReached} (${totalCalls > 0 ? Math.round((notReached / totalCalls) * 100) : 0}%)
- Interesse: ${interest}
- Afspraken: ${appointments}
- Deals: ${deals}
- Conversieratio: ${convRate}%

PIPEDRIVE LEADS:
${Object.entries(leadsByStatus)
  .map(([status, count]) => `- ${status}: ${count}`)
  .join("\n")}
- Totaal: ${leads.length}

PIPEDRIVE ACTIVITEITEN (afgelopen 7 dagen):
- Open: ${openActivities}
- Afgerond: ${doneActivities}

EOD EVALUATIES (recent):
- Gem. dagscore: ${avgDayScore ?? "geen data"}
- Gem. energie: ${avgEnergy ?? "geen data"}
${recentBlockers.length > 0 ? `- Recente blokkades: ${recentBlockers.join("; ")}` : ""}
${recentGood.length > 0 ? `- Wat goed ging: ${recentGood.join("; ")}` : ""}

ACTIEVE SIGNALEN:
${signals.length > 0 ? signals.map((s) => `- [${s.severity}] ${s.title}: ${s.description}`).join("\n") : "Geen actieve signalen"}
`;

    const systemPrompt = `Je bent de CI Engine coaching assistent voor een sales team bij KlikklaarSEO. 
Je geeft persoonlijke, actie-gerichte coaching op basis van de data van een Sales Executive.

REGELS:
- Schrijf in het Nederlands, informeel maar professioneel (je/jij)
- Geef PRECIES 3 coaching-inzichten
- Elk inzicht moet:
  1. Een korte pakkende titel hebben (max 8 woorden)
  2. Een concrete observatie bevatten gebaseerd op de data
  3. Een specifieke, direct uitvoerbare actie-tip geven
- Wees positief maar eerlijk — benoem wat goed gaat EN waar kansen liggen
- Verwijs naar specifieke cijfers uit de data
- Als er weinig data is, focus dan op het opbouwen van goede gewoontes
- Gebruik GEEN emoji's in titels, wel in de tekst als het past

Antwoord als JSON array met exact 3 objecten:
[
  {
    "title": "korte titel",
    "observation": "wat je ziet in de data",
    "tip": "concrete actie-tip",
    "category": "calls|pipeline|energie|conversie|planning"
  }
]

Antwoord ALLEEN met de JSON array, geen andere tekst.`;

    // ── Call Lovable AI ─────────────────────────────────
    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Analyseer de volgende data en geef 3 coaching-inzichten:\n\n${dataContext}`,
            },
          ],
        }),
      }
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit bereikt, probeer het later opnieuw.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({
            error: "AI credits uitgeput. Neem contact op met de beheerder.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI gateway returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent =
      aiData.choices?.[0]?.message?.content || "[]";

    // Parse JSON from response (handle markdown code blocks)
    let insights;
    try {
      const cleaned = rawContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      insights = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
      insights = [
        {
          title: "Blijf consistent bellen",
          observation: `Je hebt ${totalCalls} calls deze week gemaakt.`,
          tip: "Plan vaste belblokken in je agenda voor consistentie.",
          category: "calls",
        },
        {
          title: "Focus op je pipeline",
          observation: `Je hebt ${leads.length} leads in je pipeline.`,
          tip: "Prioriteer leads met de meeste kans op conversie.",
          category: "pipeline",
        },
        {
          title: "Evalueer je dag",
          observation: "Regelmatige evaluatie helpt bij groei.",
          tip: "Vul je EOD evaluatie in aan het einde van elke werkdag.",
          category: "energie",
        },
      ];
    }

    return new Response(
      JSON.stringify({
        insights,
        stats: {
          totalCalls,
          convRate,
          leadsTotal: leads.length,
          openActivities,
          avgDayScore,
          avgEnergy,
        },
        generated_at: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("ci-coaching error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
