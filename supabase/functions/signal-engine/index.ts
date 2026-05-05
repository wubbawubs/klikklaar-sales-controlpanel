import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SignalRule {
  id: string;
  evaluate: (ctx: SEContext) => Signal | null;
}

interface Signal {
  signal_type: string;
  severity: string;
  title: string;
  description: string;
  action: string;
  confidence: string;
}

interface SEContext {
  seId: string;
  todayCalls: any[];
  weekCalls: any[];
  openCallbacks: any[];
  openLeads: any[];
}

// ── RULES ──────────────────────────────────────────────

const rules: SignalRule[] = [
  {
    id: "no_calls_today",
    evaluate: (ctx) => {
      const hour = new Date().getHours();
      if (hour < 10) return null; // too early to judge
      if (ctx.todayCalls.length === 0) {
        return {
          signal_type: "no_activity",
          severity: "warning",
          title: "Nog geen calls vandaag",
          description: `Het is ${hour}:00 en er zijn nog geen calls geregistreerd.`,
          action: "Start nu met bellen — elke call telt!",
          confidence: "high",
        };
      }
      return null;
    },
  },
  {
    id: "high_not_reached_rate",
    evaluate: (ctx) => {
      if (ctx.todayCalls.length < 5) return null;
      const notReached = ctx.todayCalls.filter((c) => c.outcome === "not_reached").length;
      const rate = notReached / ctx.todayCalls.length;
      if (rate >= 0.8) {
        return {
          signal_type: "pattern_alert",
          severity: "warning",
          title: "Hoog niet-bereikt percentage",
          description: `${Math.round(rate * 100)}% van je calls vandaag is niet bereikt (${notReached}/${ctx.todayCalls.length}).`,
          action: "Probeer op andere tijdstippen te bellen of wissel van leadlijst",
          confidence: "high",
        };
      }
      return null;
    },
  },
  {
    id: "overdue_callbacks",
    evaluate: (ctx) => {
      const today = new Date().toISOString().split("T")[0];
      const overdue = ctx.openCallbacks.filter((c) => c.callback_date && c.callback_date < today);
      if (overdue.length >= 1) {
        return {
          signal_type: "missed_callback",
          severity: overdue.length >= 3 ? "critical" : "warning",
          title: `${overdue.length} callback(s) niet opgepakt`,
          description: `Je hebt ${overdue.length} callback(s) die al voorbij de geplande datum zijn.`,
          action: "Pak deze callbacks nu op — ze verwachten je telefoontje",
          confidence: "high",
        };
      }
      return null;
    },
  },
  {
    id: "callbacks_due_today",
    evaluate: (ctx) => {
      const today = new Date().toISOString().split("T")[0];
      const dueToday = ctx.openCallbacks.filter((c) => c.callback_date === today);
      if (dueToday.length >= 1) {
        return {
          signal_type: "callback_reminder",
          severity: "info",
          title: `${dueToday.length} callback(s) vandaag gepland`,
          description: `Je hebt ${dueToday.length} terugbel-afspra(a)k(en) voor vandaag.`,
          action: "Plan deze callbacks als eerste in je belblok",
          confidence: "high",
        };
      }
      return null;
    },
  },
  {
    id: "low_conversion_week",
    evaluate: (ctx) => {
      if (ctx.weekCalls.length < 20) return null;
      const positiveOutcomes = ctx.weekCalls.filter(
        (c) => c.outcome === "interest" || c.outcome === "appointment" || c.outcome === "deal"
      ).length;
      const rate = positiveOutcomes / ctx.weekCalls.length;
      if (rate < 0.05) {
        return {
          signal_type: "conversion_alert",
          severity: "warning",
          title: "Lage conversie deze week",
          description: `Slechts ${positiveOutcomes} positieve uitkomsten uit ${ctx.weekCalls.length} calls (${Math.round(rate * 100)}%).`,
          action: "Overweeg je pitch aan te passen of bespreek met je coach",
          confidence: "medium",
        };
      }
      return null;
    },
  },
  {
    id: "great_day",
    evaluate: (ctx) => {
      const deals = ctx.todayCalls.filter((c) => c.outcome === "deal").length;
      const appointments = ctx.todayCalls.filter((c) => c.outcome === "appointment").length;
      if (deals >= 2 || appointments >= 3) {
        return {
          signal_type: "positive_momentum",
          severity: "info",
          title: "Sterke dag! 🎯",
          description: `Al ${deals} deal(s) en ${appointments} afspra(a)k(en) vandaag.`,
          action: "Houd dit momentum vast — je bent on fire!",
          confidence: "high",
        };
      }
      return null;
    },
  },
  {
    id: "untouched_leads",
    evaluate: (ctx) => {
      // Leads assigned but no calls made to them in the last 7 days
      const untouched = ctx.openLeads.filter((lead) => {
        const hasCall = ctx.weekCalls.some((c) => c.lead_assignment_id === lead.id);
        return !hasCall;
      });
      if (untouched.length >= 3) {
        return {
          signal_type: "idle_leads",
          severity: "warning",
          title: `${untouched.length} leads nog niet gebeld`,
          description: `Er zijn ${untouched.length} toegewezen leads die je deze week nog niet hebt gebeld.`,
          action: "Plan een belblok in om deze leads te benaderen",
          confidence: "medium",
        };
      }
      return null;
    },
  },
];

// ── MAIN ───────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Optionally scope to a single SE
    let targetSeId: string | null = null;
    let isPing = false;
    try {
      const body = await req.json();
      targetSeId = body?.sales_executive_id || null;
      isPing = body?.ping === true;
    } catch {
      // no body is fine
    }

    // Handle ping/health-check requests
    if (isPing) {
      return new Response(
        JSON.stringify({ success: true, ping: "pong" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UUID format if provided
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (targetSeId && !uuidRegex.test(targetSeId)) {
      return new Response(
        JSON.stringify({ error: "Invalid sales_executive_id format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get active SEs
    let seQuery = supabase.from("sales_executives").select("id").eq("status", "active");
    if (targetSeId) {
      seQuery = seQuery.eq("id", targetSeId);
    }
    const { data: ses, error: seErr } = await seQuery;
    if (seErr) throw seErr;

    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    let signalsCreated = 0;

    for (const se of ses || []) {
      // Fetch context in parallel
      const [todayCallsRes, weekCallsRes, callbacksRes, leadsRes] = await Promise.all([
        supabase.from("calls").select("*").eq("sales_executive_id", se.id).gte("created_at", `${today}T00:00:00`),
        supabase.from("calls").select("*").eq("sales_executive_id", se.id).gte("created_at", `${weekAgo}T00:00:00`),
        supabase.from("calls").select("*").eq("sales_executive_id", se.id).eq("outcome", "callback").or(`callback_date.is.null,callback_date.lte.${today}`),
        supabase.from("lead_assignments").select("id, status").eq("sales_executive_id", se.id).in("status", ["assigned", "in_progress"]),
      ]);

      const ctx: SEContext = {
        seId: se.id,
        todayCalls: todayCallsRes.data || [],
        weekCalls: weekCallsRes.data || [],
        openCallbacks: callbacksRes.data || [],
        openLeads: leadsRes.data || [],
      };

      // Resolve old signals for this SE first
      await supabase
        .from("signals")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("sales_executive_id", se.id)
        .eq("resolved", false)
        .lt("created_at", `${today}T00:00:00`);

      // Evaluate rules
      const newSignals: Signal[] = [];
      for (const rule of rules) {
        const result = rule.evaluate(ctx);
        if (result) {
          newSignals.push(result);
        }
      }

      // Check which signal types already exist today for this SE
      const { data: existingSignals } = await supabase
        .from("signals")
        .select("signal_type")
        .eq("sales_executive_id", se.id)
        .eq("resolved", false)
        .gte("created_at", `${today}T00:00:00`);

      const existingTypes = new Set((existingSignals || []).map((s) => s.signal_type));

      // Insert only new signal types
      for (const signal of newSignals) {
        if (!existingTypes.has(signal.signal_type)) {
          await supabase.from("signals").insert({
            sales_executive_id: se.id,
            ...signal,
          });
          signalsCreated++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, signals_created: signalsCreated, ses_evaluated: ses?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
