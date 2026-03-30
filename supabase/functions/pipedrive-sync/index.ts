import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PIPELINE_NAME_FILTER = 'Sales KlikKlaar';
const BASE = 'https://api.pipedrive.com/v1';

/** Small delay helper to avoid 429s */
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Fetch with automatic retry on 429 */
async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  const res = await fetch(url);
  if (res.status === 429 && retries > 0) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '2');
    await delay(retryAfter * 1000);
    return fetchWithRetry(url, retries - 1);
  }
  return res;
}

/** Paginated fetch with rate-limit-safe delays */
async function fetchAll(url: string, token: string, maxPages = 5) {
  const all: any[] = [];
  let start = 0;
  let page = 0;
  while (page < maxPages) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetchWithRetry(`${url}${sep}api_token=${token}&start=${start}&limit=100`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pipedrive error [${res.status}]: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const items = data.data || [];
    all.push(...items);
    if (data.additional_data?.pagination?.more_items_in_collection) {
      start = data.additional_data.pagination.next_start;
      page++;
      await delay(250); // rate limit safety
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
      const usersRes = await fetchWithRetry(`${BASE}/users?api_token=${PIPEDRIVE_API_TOKEN}`);
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
    const pipelinesRes = await fetchWithRetry(`${BASE}/pipelines?api_token=${PIPEDRIVE_API_TOKEN}`);
    const pipelinesData = await pipelinesRes.json();
    const pipeline = (pipelinesData.data || []).find((p: any) =>
      p.name.toLowerCase().includes(PIPELINE_NAME_FILTER.toLowerCase())
    );
    if (!pipeline) throw new Error('Pipeline not found');

    await delay(250);

    // Fetch deals (max 5 pages = 500 deals)
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

    // Batch: collect unique person IDs and fetch them in bulk (max 50)
    const personIds = new Set<number>();
    for (const deal of deals) {
      const pid = typeof deal.person_id === 'object' ? deal.person_id?.value : deal.person_id;
      if (pid) personIds.add(pid);
    }

    const personCache = new Map<number, { email: string | null; phone: string | null }>();
    const personArray = [...personIds].slice(0, 50); // cap at 50 to avoid rate limits
    for (let i = 0; i < personArray.length; i++) {
      try {
        const pRes = await fetchWithRetry(`${BASE}/persons/${personArray[i]}?api_token=${PIPEDRIVE_API_TOKEN}`);
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData.data) {
            personCache.set(personArray[i], {
              email: pData.data.email?.[0]?.value || null,
              phone: pData.data.phone?.[0]?.value || null,
            });
          }
        }
        if (i % 5 === 4) await delay(500); // throttle every 5 requests
      } catch { /* skip */ }
    }

    // Sync deals → pipedrive_lead_assignments (batch upsert)
    const leadRows = deals.map((deal: any) => {
      const orgId = typeof deal.org_id === 'object' ? deal.org_id?.value : deal.org_id;
      const personId = typeof deal.person_id === 'object' ? deal.person_id?.value : deal.person_id;
      const orgName = typeof deal.org_id === 'object' ? deal.org_id?.name : deal.org_name;
      const personName = deal.person_name || (typeof deal.person_id === 'object' ? deal.person_id?.name : null);
      const personInfo = personId ? personCache.get(personId) : null;

      const stageOrder = deal.stage_order_nr || 0;
      let status = 'assigned';
      if (stageOrder >= 4) status = 'qualified';
      else if (stageOrder >= 2) status = 'contacted';

      return {
        sales_executive_id: se.id,
        pipedrive_deal_id: deal.id,
        pipedrive_org_id: orgId || null,
        pipedrive_person_id: personId || null,
        org_name: orgName || deal.title,
        person_name: personName,
        person_email: personInfo?.email || null,
        person_phone: personInfo?.phone || null,
        deal_title: deal.title,
        status,
      };
    });

    // Upsert in batches of 50
    for (let i = 0; i < leadRows.length; i += 50) {
      const batch = leadRows.slice(i, i + 50);
      const { error } = await supabase
        .from('pipedrive_lead_assignments')
        .upsert(batch, { onConflict: 'sales_executive_id,pipedrive_deal_id' });
      if (error) console.error('Lead batch upsert error:', error.message);
      else synced_leads += batch.length;
    }

    // Sync Pipedrive activities for this user (last 14 days only)
    if (pipedriveUserId) {
      try {
        await delay(500);
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const sinceDate = fourteenDaysAgo.toISOString().split('T')[0];

        const activities = await fetchAll(
          `${BASE}/activities?user_id=${pipedriveUserId}&done=1&since=${sinceDate}`,
          PIPEDRIVE_API_TOKEN,
          3 // max 3 pages = 300 activities
        );

        const actRows = activities
          .filter((act: any) => act.id != null)
          .map((act: any) => ({
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
          }));

        // Upsert in batches of 50
        for (let i = 0; i < actRows.length; i += 50) {
          const batch = actRows.slice(i, i + 50);
          const { error } = await supabase
            .from('pipedrive_activities')
            .upsert(batch, { onConflict: 'sales_executive_id,pipedrive_activity_id' });
          if (error) console.error('Activity batch upsert error:', error.message);
          else synced_activities += batch.length;
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
