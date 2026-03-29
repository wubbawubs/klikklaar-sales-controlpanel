import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ADMIN_EMAIL = "robin.dennie@onetimerecruit.nl";

const SUGGESTED_FIXES: Record<string, string> = {
  supabase_connectivity: "Database connectiviteit is verstoord. Controleer de Supabase-status en netwerkconfiguratie.",
  pipedrive_sync_stale: "Pipedrive synchronisatie loopt achter. Controleer of de PIPEDRIVE_API_TOKEN geldig is en of de sync-functie correct draait.",
  ci_engine_down: "De CI Engine is niet bereikbaar. Controleer of de edge function 'ci-coaching' correct is gedeployed.",
  edge_functions_down: "Edge Functions zijn niet bereikbaar. Controleer de Supabase Edge Functions status.",
  pipedrive_api_error: "Pipedrive API geeft een fout. Controleer of de API-token nog geldig is en het ratelimit niet is bereikt.",
  unknown: "Er is een onbekende fout opgetreden. Controleer de logs voor meer details.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { seId, seName, checkType, errorMessage, errorCode } = await req.json();

    if (!seId || !checkType) {
      return new Response(
        JSON.stringify({ error: "seId and checkType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const suggestedFix = SUGGESTED_FIXES[errorCode ?? ""] || SUGGESTED_FIXES[checkType] || SUGGESTED_FIXES.unknown;

    // Deduplication: check if same check_type + SE was notified in last 30 min
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recentEvents } = await supabase
      .from("health_events")
      .select("id")
      .eq("sales_executive_id", seId)
      .eq("check_type", checkType)
      .eq("notified", true)
      .gte("created_at", thirtyMinAgo)
      .limit(1);

    const alreadyNotified = (recentEvents?.length ?? 0) > 0;

    // Log the health event
    await supabase.from("health_events").insert({
      sales_executive_id: seId,
      check_type: checkType,
      status: "critical",
      error_message: errorMessage || "Unknown error",
      error_code: errorCode || checkType,
      suggested_fix: suggestedFix,
      notified: !alreadyNotified,
    });

    // Send email if not already notified recently
    if (!alreadyNotified) {
      const emailSubject = `🚨 Health Alert: ${checkType} — ${seName || "Unknown SE"}`;
      const emailBody = `
Hallo,

Er is een kritieke fout gedetecteerd in de SE-omgeving.

SE: ${seName || "Onbekend"}
Check: ${checkType}
Fout: ${errorMessage || "Geen details beschikbaar"}
Code: ${errorCode || "N/A"}

Voorgestelde oplossing:
${suggestedFix}

—
Klikklaar Health Monitor
      `.trim();

      const resendKey = Deno.env.get("RESEND_API_KEY");

      if (resendKey) {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Klikklaar Platform <noreply@klikklaar.nl>",
            to: [ADMIN_EMAIL],
            subject: emailSubject,
            text: emailBody,
          }),
        });

        if (!emailRes.ok) {
          console.error("Email send failed:", await emailRes.text());
        }
      } else {
        console.log(`[health-alert] No RESEND_API_KEY. Would send to ${ADMIN_EMAIL}:`);
        console.log(`Subject: ${emailSubject}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, notified: !alreadyNotified, suggestedFix }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Health alert error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
