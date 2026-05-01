// Closer reminders: stuurt dagelijks notificaties + emails voor stale appointments
// en overdue next_action_at. Trigger via pg_cron of handmatig (POST {} of {ping:true}).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Stale-drempels per status (dagen zonder activiteit)
const STALE_THRESHOLDS: Record<string, number> = {
  call: 2,
  follow_up: 5,
  no_show: 3,
  nog_betalen: 7,
  deal: 30,
  no_deal: 9999,
};

const STATUS_LABEL: Record<string, string> = {
  call: "Bellen",
  no_show: "No show",
  follow_up: "Follow-up",
  deal: "Deal",
  nog_betalen: "Nog betalen",
  no_deal: "Geen deal",
};

interface Appointment {
  id: string;
  closer_user_id: string;
  status: string;
  org_name: string | null;
  contact_name: string | null;
  scheduled_at: string | null;
  last_activity_at: string;
  next_action_at: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.ping) {
      return new Response(JSON.stringify({ ok: true, ping: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();

    // Haal alle open appointments op (geen no_deal/deal-tail)
    const { data: appts, error } = await supabase
      .from("closer_appointments")
      .select("id, closer_user_id, status, org_name, contact_name, scheduled_at, last_activity_at, next_action_at")
      .not("status", "in", "(no_deal)");

    if (error) throw error;

    const stale: Appointment[] = [];
    const overdue: Appointment[] = [];

    for (const a of (appts ?? []) as Appointment[]) {
      // Overdue: next_action_at in het verleden
      if (a.next_action_at && new Date(a.next_action_at) <= now) {
        overdue.push(a);
        continue;
      }
      // Stale: geen activiteit > drempel
      const threshold = STALE_THRESHOLDS[a.status] ?? 7;
      const lastTs = new Date(a.last_activity_at).getTime();
      const daysSince = Math.floor((now.getTime() - lastTs) / (1000 * 60 * 60 * 24));
      if (daysSince >= threshold) stale.push(a);
    }

    // Groepeer per closer
    const byCloser = new Map<string, { stale: Appointment[]; overdue: Appointment[] }>();
    for (const a of stale) {
      if (!byCloser.has(a.closer_user_id)) byCloser.set(a.closer_user_id, { stale: [], overdue: [] });
      byCloser.get(a.closer_user_id)!.stale.push(a);
    }
    for (const a of overdue) {
      if (!byCloser.has(a.closer_user_id)) byCloser.set(a.closer_user_id, { stale: [], overdue: [] });
      byCloser.get(a.closer_user_id)!.overdue.push(a);
    }

    // Dedup: skip closers die in laatste 20u al een reminder kregen
    const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
    let notifications = 0;
    let emailsQueued = 0;

    for (const [closerId, groups] of byCloser.entries()) {
      const total = groups.stale.length + groups.overdue.length;
      if (total === 0) continue;

      const { data: recent } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", closerId)
        .eq("type", "closer_reminder")
        .gte("created_at", twentyHoursAgo)
        .limit(1);
      if ((recent?.length ?? 0) > 0) continue;

      const overdueLines = groups.overdue.slice(0, 10).map((a) => {
        const name = a.org_name || a.contact_name || "Onbekend";
        return `, ${name} (${STATUS_LABEL[a.status] ?? a.status}), actie verlopen`;
      });
      const staleLines = groups.stale.slice(0, 10).map((a) => {
        const name = a.org_name || a.contact_name || "Onbekend";
        const days = Math.floor((now.getTime() - new Date(a.last_activity_at).getTime()) / (1000 * 60 * 60 * 24));
        return `, ${name} (${STATUS_LABEL[a.status] ?? a.status}), ${days}d geen activiteit`;
      });

      const title = `Closer CRM, ${total} ${total === 1 ? "actie" : "acties"} vragen aandacht`;
      const bodyText = [
        groups.overdue.length ? `${groups.overdue.length} overdue:` : null,
        ...overdueLines,
        groups.stale.length ? `${groups.stale.length} stale:` : null,
        ...staleLines,
      ].filter(Boolean).join("\n");

      // Notificatie (push wordt via trigger send_push_on_notification verstuurd)
      const { error: notifErr } = await supabase.from("notifications").insert({
        user_id: closerId,
        title,
        body: bodyText,
        type: "closer_reminder",
        action_url: "/closer",
      });
      if (!notifErr) notifications++;

      // Email via queue (best effort, alleen als profiel een email heeft)
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("user_id", closerId)
        .maybeSingle();

      if (profile?.email) {
        const html = `
          <div style="font-family:system-ui,sans-serif;color:#0f172a">
            <h2 style="color:#0F9B7A">${title}</h2>
            <p>Hoi ${profile.full_name ?? ""},</p>
            <p>Er staan acties open in je Closer CRM:</p>
            <pre style="background:#f1f5f9;padding:12px;border-radius:8px;white-space:pre-wrap">${bodyText}</pre>
            <p><a href="https://sales.klikklaarseo.nl/closer" style="background:#0F9B7A;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open Closer CRM</a></p>
          </div>`;

        const { error: enqErr } = await supabase.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            to: profile.email,
            subject: title,
            html,
            template_name: "closer_reminder",
            metadata: { closer_user_id: closerId, total },
          },
        });
        if (!enqErr) emailsQueued++;
      }

      await supabase.from("audit_logs").insert({
        action_type: "closer_reminder_sent",
        entity_type: "closer_user",
        entity_id: closerId,
        after_json: { stale: groups.stale.length, overdue: groups.overdue.length },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: appts?.length ?? 0,
        stale: stale.length,
        overdue: overdue.length,
        notifications,
        emailsQueued,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[closer-reminders]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
