import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PIPELINE_NAME_FILTER = 'Sales KlikKlaar';
const BASE = 'https://api.pipedrive.com/v1';

async function fetchAll(url: string, token: string) {
  const all: any[] = [];
  let start = 0;
  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}api_token=${token}&start=${start}&limit=500`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Pipedrive error [${res.status}]`);
    const items = data.data || [];
    all.push(...items);
    if (data.additional_data?.pagination?.more_items_in_collection) {
      start = data.additional_data.pagination.next_start;
    } else break;
  }
  return all;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const PIPEDRIVE_API_TOKEN = Deno.env.get('PIPEDRIVE_API_TOKEN');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!PIPEDRIVE_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'PIPEDRIVE_API_TOKEN not set' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { sales_executive_id } = body;
    if (!sales_executive_id) throw new Error('sales_executive_id required');

    // Get SE info
    const { data: se, error: seErr } = await supabase
      .from('sales_executives')
      .select('id, email, employment_type')
      .eq('id', sales_executive_id)
      .single();
    if (seErr || !se) throw new Error('SE not found');

    const isEmployee = se.employment_type === 'employee';
    let pipedriveUserId: number | null = null;

    // Resolve Pipedrive user for employees
    if (isEmployee) {
      const usersRes = await fetch(`${BASE}/users?api_token=${PIPEDRIVE_API_TOKEN}`);
      const usersData = await usersRes.json();
      const users = usersData.data || [];
      const match = users.find((u: any) => u.email?.toLowerCase() === se.email.toLowerCase());
      if (match) pipedriveUserId = match.id;
    }

    if (!pipedriveUserId && isEmployee) {
      return new Response(JSON.stringify({ synced: false, reason: 'No Pipedrive user found for email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find pipeline
    const pipelinesRes = await fetch(`${BASE}/pipelines?api_token=${PIPEDRIVE_API_TOKEN}`);
    const pipelinesData = await pipelinesRes.json();
    const pipeline = (pipelinesData.data || []).find((p: any) =>
      p.name.toLowerCase().includes(PIPELINE_NAME_FILTER.toLowerCase())
    );
    if (!pipeline) throw new Error('Pipeline not found');

    // Fetch deals
    let deals = await fetchAll(`${BASE}/deals?status=open&pipeline_id=${pipeline.id}`, PIPEDRIVE_API_TOKEN);

    // Filter by user for employees
    if (pipedriveUserId) {
      deals = deals.filter((d: any) => {
        const uid = typeof d.user_id === 'object' ? d.user_id?.id : d.user_id;
        return uid === pipedriveUserId;
      });
    }

    let synced_leads = 0;
    let synced_activities = 0;

    // Sync deals → pipedrive_lead_assignments
    for (const deal of deals) {
      const orgId = typeof deal.org_id === 'object' ? deal.org_id?.value : deal.org_id;
      const personId = typeof deal.person_id === 'object' ? deal.person_id?.value : deal.person_id;
      const orgName = typeof deal.org_id === 'object' ? deal.org_id?.name : deal.org_name;
      const personName = deal.person_name || (typeof deal.person_id === 'object' ? deal.person_id?.name : null);

      // Get person details for email/phone
      let personEmail: string | null = null;
      let personPhone: string | null = null;
      if (personId) {
        try {
          const pRes = await fetch(`${BASE}/persons/${personId}?api_token=${PIPEDRIVE_API_TOKEN}`);
          const pData = await pRes.json();
          if (pData.data) {
            personEmail = pData.data.email?.[0]?.value || null;
            personPhone = pData.data.phone?.[0]?.value || null;
          }
        } catch {}
      }

      // Map deal status to our status
      let status = 'assigned';
      // Use stage position as a rough status indicator
      const stageOrder = deal.stage_order_nr || 0;
      if (stageOrder >= 4) status = 'qualified';
      else if (stageOrder >= 2) status = 'contacted';

      // Upsert by pipedrive_deal_id
      const { error: upsertErr } = await supabase
        .from('pipedrive_lead_assignments')
        .upsert({
          sales_executive_id: se.id,
          pipedrive_deal_id: deal.id,
          pipedrive_org_id: orgId || null,
          pipedrive_person_id: personId || null,
          org_name: orgName || deal.title,
          person_name: personName,
          person_email: personEmail,
          person_phone: personPhone,
          deal_title: deal.title,
          status,
        }, { onConflict: 'sales_executive_id,pipedrive_deal_id', ignoreDuplicates: false });

      if (!upsertErr) synced_leads++;
    }

    // Sync Pipedrive activities for this user
    if (pipedriveUserId) {
      try {
        const activities = await fetchAll(
          `${BASE}/activities?user_id=${pipedriveUserId}&done=1`,
          PIPEDRIVE_API_TOKEN
        );

        // Only sync last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        for (const act of activities) {
          const actDate = new Date(act.add_time || act.due_date);
          if (actDate < thirtyDaysAgo) continue;

          const { error: actErr } = await supabase
            .from('pipedrive_activities')
            .upsert({
              sales_executive_id: se.id,
              pipedrive_activity_id: act.id,
              activity_type: act.type || 'call',
              subject: act.subject || null,
              note: act.note || null,
              done: act.done === true || act.done === 1,
              due_date: act.due_date || null,
              duration_minutes: act.duration ? parseInt(act.duration) : null,
              pipedrive_org_id: act.org_id || null,
              pipedrive_person_id: act.person_id || null,
              pipedrive_deal_id: act.deal_id || null,
              synced_to_pipedrive: true,
            }, { onConflict: 'sales_executive_id,pipedrive_activity_id', ignoreDuplicates: false });

          if (!actErr) synced_activities++;
        }
      } catch (e) {
        console.error('Activity sync error:', e);
      }
    }

    return new Response(JSON.stringify({
      synced: true,
      synced_leads,
      synced_activities,
      pipedrive_user_id: pipedriveUserId,
      deals_found: deals.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Sync error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
