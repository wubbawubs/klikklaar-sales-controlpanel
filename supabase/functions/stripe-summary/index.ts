// Stripe summary API for the control-panel finance module.
// Pulls live MRR/ARR, balance, recent charges and failed incasso's from Stripe.
// The Stripe secret stays server-side (STRIPE_SECRET_KEY); the gateway verifies
// the caller's JWT, so only a logged-in team member can hit this.
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

const KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

async function stripe(path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`Stripe ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// Normalise a recurring price to a monthly amount (in cents).
function toMonthly(unitAmount: number, qty: number, interval: string, count: number): number {
  const per = unitAmount * qty;
  const months = interval === "year" ? 12 * count
    : interval === "week" ? count / 4.345
    : interval === "day" ? count / 30.42
    : count; // month
  return months > 0 ? per / months : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!KEY) return json({ configured: false });

  try {
    // ── Balance (available + pending, per currency) ──────────────
    const balance = await stripe("balance");
    const sumBal = (arr: any[]) => (arr ?? []).reduce((s, b) => s + (b.amount ?? 0), 0);
    const available = sumBal(balance.available);
    const pending = sumBal(balance.pending);
    const currency = balance.available?.[0]?.currency ?? "eur";

    // ── Active subscriptions → MRR ───────────────────────────────
    const subs = await stripe("subscriptions?status=active&limit=100&expand[]=data.items");
    let mrrCents = 0;
    let activeSubs = 0;
    for (const s of subs.data ?? []) {
      activeSubs++;
      for (const it of s.items?.data ?? []) {
        const price = it.price;
        if (!price?.recurring) continue;
        mrrCents += toMonthly(price.unit_amount ?? 0, it.quantity ?? 1, price.recurring.interval, price.recurring.interval_count ?? 1);
      }
    }

    // ── Recent charges + failed incasso's ────────────────────────
    const charges = await stripe("charges?limit=20");
    const recent = (charges.data ?? []).map((c: any) => ({
      id: c.id,
      amount: c.amount,
      currency: c.currency,
      status: c.status,
      paid: c.paid,
      created: c.created,
      description: c.description ?? c.billing_details?.name ?? null,
      customer_email: c.billing_details?.email ?? c.receipt_email ?? null,
    }));
    const failed = recent.filter((c: any) => c.status === "failed" || (!c.paid && c.status !== "succeeded"));

    return json({
      configured: true,
      currency,
      balance: { available, pending },
      mrr: Math.round(mrrCents),
      arr: Math.round(mrrCents * 12),
      activeSubs,
      subsHasMore: !!subs.has_more,
      recent,
      failed,
    });
  } catch (e) {
    return json({ configured: true, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
