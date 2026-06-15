// Pipeline summary API — consumed by one-group-bot's /pipeline command.
// Auth: Authorization: Bearer <PIPELINE_API_KEY> (set via supabase secrets).
// Response shape matches one-group-bot src/skills/pipeline.ts formatPipeline().
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const apiKey = Deno.env.get("PIPELINE_API_KEY");
  const auth = req.headers.get("Authorization") ?? "";
  if (!apiKey || auth !== `Bearer ${apiKey}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter")?.toLowerCase() ?? "";

  // ── Open deals (not won, not lost) with stage name ──────────────
  const { data: dealRows, error: dealsErr } = await supabase
    .from("deals")
    .select(
      "id, title, value_eur, stage_updated_at, won_at, lost_at, company:companies(name), stage:pipeline_stages(name)",
    )
    .is("won_at", null)
    .is("lost_at", null)
    .order("stage_updated_at", { ascending: true });
  if (dealsErr) return json({ error: dealsErr.message }, 500);

  const now = Date.now();
  const deals = (dealRows ?? [])
    .map((d) => {
      const company = (d.company as { name: string } | null)?.name;
      const name = company ? `${d.title} (${company})` : d.title;
      const stage = (d.stage as { name: string } | null)?.name ?? "Geen stage";
      const daysInStage = d.stage_updated_at
        ? Math.floor((now - new Date(d.stage_updated_at).getTime()) / 86_400_000)
        : 0;
      return {
        name,
        stage,
        value: d.value_eur ? Number(d.value_eur) : undefined,
        days_in_stage: daysInStage,
      };
    })
    .filter((d) =>
      !filter ||
      d.name.toLowerCase().includes(filter) ||
      d.stage.toLowerCase().includes(filter)
    );

  // ── Onboarding: cards on boards named like "onboarding" ─────────
  // List name = status, days since the card was created.
  const { data: obBoards } = await supabase
    .from("boards")
    .select("id")
    .ilike("name", "%onboarding%");

  let onboarding: Array<{ client: string; days: number; status: string }> = [];
  const boardIds = (obBoards ?? []).map((b) => b.id);
  if (boardIds.length > 0) {
    const { data: cards } = await supabase
      .from("board_cards")
      .select("title, created_at, list:board_lists(name)")
      .in("board_id", boardIds)
      .order("created_at", { ascending: true });
    onboarding = (cards ?? []).map((c) => ({
      client: c.title,
      days: Math.floor((now - new Date(c.created_at).getTime()) / 86_400_000),
      status: (c.list as { name: string } | null)?.name ?? "unknown",
    }));
  }

  // ── Revenue: deals won this calendar month vs target ────────────
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: wonRows } = await supabase
    .from("deals")
    .select("value_eur, won_at")
    .not("won_at", "is", null)
    .gte("won_at", monthStart.toISOString());

  const current = (wonRows ?? []).reduce(
    (sum, d) => sum + (d.value_eur ? Number(d.value_eur) : 0),
    0,
  );
  const target = Number(Deno.env.get("REVENUE_TARGET_EUR") ?? "8000");

  return json({ deals, onboarding, revenue: { current, target } });
});
