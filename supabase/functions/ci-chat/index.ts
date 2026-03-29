import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { sales_executive_id, messages } = await req.json();
    if (!sales_executive_id) throw new Error("sales_executive_id required");
    if (!messages || !Array.isArray(messages) || messages.length === 0)
      throw new Error("messages array required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Gather SE context ──────────────────────────────
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    const seRes = await supabase
      .from("sales_executives")
      .select("full_name, first_name, employment_type")
      .eq("id", sales_executive_id)
      .single();

    const firstName = seRes.data?.first_name || "";
    const seName = seRes.data?.full_name || firstName || "Sales Executive";

    const [callsRes, leadsRes, activitiesRes, eodRes, signalsRes] =
      await Promise.all([
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
          .ilike("employee_name", `%${firstName}%`)
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

    const calls = callsRes.data || [];
    const leads = leadsRes.data || [];
    const activities = activitiesRes.data || [];
    const eods = eodRes.data || [];
    const signals = signalsRes.data || [];

    // ── Compute stats ──────────────────────────────────
    const totalCalls = calls.length;
    const notReached = calls.filter((c) => c.outcome === "not_reached").length;
    const interest = calls.filter((c) => c.outcome === "interest").length;
    const appointments = calls.filter((c) => c.outcome === "appointment").length;
    const deals = calls.filter((c) => c.outcome === "deal").length;
    const convRate = totalCalls > 0
      ? Math.round(((interest + appointments + deals) / totalCalls) * 100)
      : 0;

    const leadsByStatus: Record<string, number> = {};
    for (const l of leads) leadsByStatus[l.status] = (leadsByStatus[l.status] || 0) + 1;

    const openActivities = activities.filter((a) => !a.done).length;
    const doneActivities = activities.filter((a) => a.done).length;

    const avgDayScore = eods.length > 0
      ? Math.round((eods.reduce((s, e) => s + (e.day_score || 0), 0) / eods.length) * 10) / 10
      : null;
    const avgEnergy = eods.length > 0
      ? Math.round((eods.reduce((s, e) => s + (e.energy_score || 0), 0) / eods.length) * 10) / 10
      : null;

    const recentBlockers = eods.filter((e) => e.blocker_text).map((e) => e.blocker_text).slice(0, 3);
    const recentGood = eods.filter((e) => e.good_things).map((e) => e.good_things).slice(0, 3);

    // ── Build system prompt with context ─────────────
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
${Object.entries(leadsByStatus).map(([status, count]) => `- ${status}: ${count}`).join("\n")}
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

    const systemPrompt = `Je bent de CI Engine coaching assistent voor ${seName} bij KlikklaarSEO.
Je hebt toegang tot de volgende actuele data van deze Sales Executive:

${dataContext}

REGELS:
- Schrijf in het Nederlands, informeel maar professioneel (je/jij)
- Wees concreet en verwijs naar specifieke cijfers uit de data
- Geef actie-gerichte adviezen
- Wees positief maar eerlijk
- Als je iets niet weet op basis van de data, zeg dat dan eerlijk
- Houd antwoorden beknopt maar nuttig (max 200 woorden per antwoord)
- Gebruik markdown formatting voor leesbaarheid
- Je mag emoji's gebruiken waar het past`;

    // ── Stream response from Lovable AI ─────────────
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
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit bereikt, probeer het later opnieuw." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits uitgeput." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI gateway returned ${aiResponse.status}`);
    }

    return new Response(aiResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ci-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
