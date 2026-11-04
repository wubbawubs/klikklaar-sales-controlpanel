// Reads a pasted meeting transcript and stores AI-proposed CRM changes. Nothing in the CRM changes here:
// proposals are applied one by one by the user via the apply_meeting_proposal RPC.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";
import { buildSnapshot, normalizeProposals, snapshotPrompt, PROPOSAL_KINDS, type AiItem } from "../_shared/meetingNormalize.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MODEL = "claude-opus-5-5";
const AI_TIMEOUT_MS = 140_000;
const WEEKDAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
const ITEM_FIELDS = {
  kind: { type: "string", enum: PROPOSAL_KINDS },
  quote: { type: "string" },
  company_ref: nullable("string"),
  candidate_company_refs: { type: "array", items: { type: "string" } },
  company_name: nullable("string"),
  deal_ref: nullable("string"),
  stage_ref: nullable("string"),
  lost_reason: nullable("string"),
  body: nullable("string"),
  value_eur: nullable("number"),
  user_ref: nullable("string"),
  date: nullable("string"),
  appointment_type: nullable("string"),
  title: nullable("string"),
  deal_title: nullable("string"),
  contact_name: nullable("string"),
};
// Structured output: Claude must answer with exactly this JSON shape.
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "object", properties: ITEM_FIELDS, required: Object.keys(ITEM_FIELDS), additionalProperties: false },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function systemPrompt(meetingDate: string): string {
  const weekday = WEEKDAYS[new Date(`${meetingDate}T12:00:00Z`).getUTCDay()];
  return `Je verwerkt het transcript van een wekelijkse sales-update-meeting van een Nederlands SEO-bureau.
Doel: stel per besproken klant/deal de CRM-wijzigingen voor die in de meeting zijn genoemd. Een mens controleert alles daarna.

Soorten (kind):
- stage: deal gaat naar een andere fase (stage_ref)
- won: deal is gewonnen / getekend
- lost: deal is verloren of afgehaakt (lost_reason als die genoemd wordt)
- note: relevante info voor de tijdlijn van de deal (body, kort en zakelijk, in het Nederlands)
- value: nieuw bedrag voor de deal (value_eur, alleen als er een concreet bedrag is genoemd)
- owner: iemand anders neemt de deal over (user_ref)
- appointment: concrete opvolgactie met een dag (date als YYYY-MM-DD, appointment_type call of meeting, user_ref wie het doet, title kort)
- new_deal: klant die NIET in de bedrijvenlijst staat (company_name, deal_title, stage_ref, contact_name, value_eur, body)

Regels — heel belangrijk:
- Stel alleen voor wat expliciet gezegd wordt. Verzin nooit bedragen, datums, fases of personen. Laat een veld null als het niet genoemd is.
- Gebruik alleen refs uit de lijsten hieronder. Weet je niet zeker welk bedrijf bedoeld wordt? Zet company_ref op null en geef candidate_company_refs met de mogelijke bedrijven.
- Heeft een bedrijf meerdere deals en is niet duidelijk welke? Zet deal_ref op null.
- De meeting was op ${weekday} ${meetingDate}. Reken relatieve dagen ("vrijdag", "morgen", "volgende week dinsdag") vanaf die datum, en altijd de eerstvolgende keer na de meetingdag. Geen concrete dag (bijv. "binnenkort", "begin volgende week")? Dan wordt het een note, geen appointment.
- Een klant die niet in de bedrijvenlijst staat → new_deal, niet een ander bedrijf kiezen.
- quote: een kort letterlijk stukje uit het transcript waar het voorstel op gebaseerd is.
- Eén item per wijziging. Fase + notitie voor dezelfde deal = twee items.
- Negeer small talk, interne zaken en dingen die niet over een klant gaan.
- appointment_type is "call" of "meeting"; voor andere soorten null.
- Geef je antwoord als JSON met een lijst "items" (leeg als er niets te wijzigen is).`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Niet ingelogd" }, 401);

  const { import_id } = await req.json().catch(() => ({}));
  if (!import_id) return json({ error: "import_id ontbreekt" }, 400);

  // RLS on the user client is the access check: only org members can see the import.
  const { data: imp } = await userClient.from("meeting_imports")
    .select("id, org_id, meeting_date, transcript").eq("id", import_id).maybeSingle();
  if (!imp) return json({ error: "Meeting niet gevonden" }, 404);

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return json({ error: "AI is niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt)" }, 500);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // One run at a time, and never after something was applied (would propose the same changes again).
  const { data: claim, error: claimError } = await admin.rpc("claim_meeting_import", { p_import_id: imp.id });
  if (claimError) return json({ error: `Analyse kon niet starten: ${claimError.message}` }, 500);
  if (claim === "applied") return json({ error: "Er zijn al voorstellen toegepast; opnieuw analyseren kan dan niet meer" }, 409);
  if (claim === "busy") return json({ error: "Deze meeting wordt al geanalyseerd" }, 409);
  if (claim !== "ok") return json({ error: "Meeting niet gevonden" }, 404);

  const fail = (error: string) => admin.from("meeting_imports").update({ status: "failed", error }).eq("id", imp.id);

  const run = async () => {
    try {
      // PostgREST caps responses (1000 rows by default), so page through big tables.
      const fetchAll = async (table: string, cols: string, orgCol = "org_id") => {
        const out: Record<string, unknown>[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await admin.from(table).select(cols).eq(orgCol, imp.org_id).order("id").range(from, from + 999);
          if (error) throw new Error(error.message);
          out.push(...(data ?? []));
          if (!data || data.length < 1000) return { data: out };
        }
      };
      const [companies, deals, stages, members] = await Promise.all([
        fetchAll("companies", "id, name"),
        fetchAll("deals", "id, title, company_id, stage_id, value_eur, assigned_to"),
        fetchAll("pipeline_stages", "id, name, position"),
        fetchAll("user_organizations", "user_id", "organization_id"),
      ]);
      const ids = (members.data ?? []).map((m: { user_id: string }) => m.user_id);
      const { data: profiles } = ids.length
        ? await admin.from("profiles").select("user_id, full_name, email").in("user_id", ids)
        : { data: [] };

      const snap = buildSnapshot({
        companies: companies.data as never,
        deals: (deals.data ?? []).map((d: Record<string, unknown>) => ({ ...d, value_eur: d.value_eur == null ? null : Number(d.value_eur) })) as never,
        stages: stages.data as never,
        members: (profiles ?? []).map((p: { user_id: string; full_name: string | null; email: string | null }) =>
          ({ user_id: p.user_id, name: p.full_name || p.email || "Onbekend" })),
      });

      const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 1 });
      const msg = await claude.beta.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        // If Claude declines (rare false positive on safety filters), the API retries on a fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: systemPrompt(imp.meeting_date),
        messages: [{ role: "user", content: `${snapshotPrompt(snap)}\n\n=== TRANSCRIPT ===\n${imp.transcript}` }],
      } as never).finalMessage();

      if (msg.stop_reason === "refusal") return void await fail("Analyse mislukt: de AI weigerde dit transcript te verwerken");
      if (msg.stop_reason === "max_tokens") return void await fail("Analyse mislukt: transcript te lang voor één analyse — splits het op");
      const text = msg.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
      if (!text) return void await fail("Analyse mislukt: AI gaf geen bruikbaar antwoord");
      const parsed = JSON.parse(text);
      const items: AiItem[] = Array.isArray(parsed?.items) ? parsed.items : [];

      const rows = normalizeProposals(items, snap, imp.meeting_date).map(r => ({ ...r, org_id: imp.org_id, import_id: imp.id }));
      if (rows.length) {
        const { error } = await admin.from("meeting_proposals").insert(rows);
        if (error) throw new Error(error.message);
      }
      await admin.from("meeting_imports").update({ status: "ready", analyzed_at: new Date().toISOString(), error: null }).eq("id", imp.id);
    } catch (e) {
      console.error("meeting-analyze failed", e);
      if (e instanceof Anthropic.APIConnectionTimeoutError) return void await fail("Analyse duurde te lang — probeer het opnieuw");
      if (e instanceof Anthropic.RateLimitError) return void await fail("AI is even overbelast, probeer het over een minuut opnieuw");
      if (e instanceof Anthropic.AuthenticationError) return void await fail("AI-sleutel ongeldig — controleer ANTHROPIC_API_KEY");
      if (e instanceof Anthropic.APIError) return void await fail(`Analyse mislukt: AI gaf foutcode ${e.status}`);
      await fail(`Analyse mislukt: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  EdgeRuntime.waitUntil(run());
  return json({ ok: true }, 202);
});
