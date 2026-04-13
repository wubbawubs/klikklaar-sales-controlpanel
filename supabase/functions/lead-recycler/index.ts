import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.1/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();

    // 1. Voicemail/not_reached: reset leads back to 'assigned' if last call was 3+ days ago
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Find leads that are 'contacted' and whose most recent call was 'not_reached' and older than 3 days
    const { data: contactedLeads, error: clErr } = await supabase
      .from("pipedrive_lead_assignments")
      .select("id, sales_executive_id")
      .eq("status", "contacted");

    if (clErr) throw clErr;

    let voicemailReset = 0;
    let callbackReset = 0;

    for (const lead of contactedLeads || []) {
      // Get the most recent call for this lead
      const { data: lastCall } = await supabase
        .from("calls")
        .select("outcome, created_at, callback_date")
        .eq("lead_assignment_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastCall) continue;

      const callAge = now.getTime() - new Date(lastCall.created_at).getTime();
      const daysSinceCall = callAge / (1000 * 60 * 60 * 24);

      // Voicemail (not_reached): recycle after 3 days
      if (lastCall.outcome === "not_reached" && daysSinceCall >= 3) {
        await supabase
          .from("pipedrive_lead_assignments")
          .update({ status: "assigned", updated_at: now.toISOString() })
          .eq("id", lead.id);
        voicemailReset++;
        continue;
      }

      // Callback: recycle after 7 days past the callback_date (or 7 days since call if no date set)
      if (lastCall.outcome === "callback") {
        const referenceDate = lastCall.callback_date
          ? new Date(lastCall.callback_date)
          : new Date(lastCall.created_at);
        const daysPastReference = (now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysPastReference >= 7) {
          await supabase
            .from("pipedrive_lead_assignments")
            .update({ status: "assigned", updated_at: now.toISOString() })
            .eq("id", lead.id);
          callbackReset++;
        }
      }
    }

    const result = {
      success: true,
      recycled: { voicemail_after_3d: voicemailReset, callback_after_7d: callbackReset },
      checked: contactedLeads?.length || 0,
      timestamp: now.toISOString(),
    };

    console.log("Lead recycler result:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Lead recycler error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
