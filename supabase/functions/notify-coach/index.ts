import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COACH_EMAIL = "robin.dennie@onetimerecruit.nl";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { seName, seId, message } = await req.json();

    if (!seName || !seId) {
      return new Response(
        JSON.stringify({ error: "seName and seId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Send email via Supabase Auth admin (using the built-in email service)
    // We'll use a simple approach: insert into a notification log and use
    // Supabase's built-in email capabilities
    const emailSubject = `🚨 Hulpverzoek van ${seName}`;
    const emailBody = `
Hallo,

${seName} heeft zojuist een hulpverzoek ingediend via het Sales Dashboard.

${message ? `Bericht: "${message}"` : "Er is geen extra toelichting gegeven."}

Neem zo snel mogelijk contact op.

—
Klikklaar Sales Platform
    `.trim();

    // Try to send via Resend if API key exists, otherwise log the signal
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
          to: [COACH_EMAIL],
          subject: emailSubject,
          text: emailBody,
        }),
      });

      if (!emailRes.ok) {
        console.error("Email send failed:", await emailRes.text());
      }
    } else {
      console.log(`[notify-coach] No RESEND_API_KEY set. Would send to ${COACH_EMAIL}:`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Body: ${emailBody}`);
    }

    // Always log as audit
    await supabase.from("audit_logs").insert({
      action_type: "help_request",
      entity_type: "sales_executive",
      entity_id: seId,
      after_json: { seName, message, notified_email: COACH_EMAIL },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
