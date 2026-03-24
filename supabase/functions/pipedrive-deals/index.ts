import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PIPELINE_NAME_FILTER = 'Sales KlikKlaar';

async function fetchAllDeals(base: string, token: string, pipelineId: number) {
  const allDeals: any[] = [];
  let start = 0;
  const limit = 500;

  while (true) {
    const res = await fetch(
      `${base}/deals?api_token=${token}&status=open&pipeline_id=${pipelineId}&start=${start}&limit=${limit}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(`Pipedrive deals error [${res.status}]: ${JSON.stringify(data)}`);

    const deals = data.data || [];
    allDeals.push(...deals);

    if (data.additional_data?.pagination?.more_items_in_collection) {
      start = data.additional_data.pagination.next_start;
    } else {
      break;
    }
  }
  return allDeals;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const PIPEDRIVE_API_TOKEN = Deno.env.get('PIPEDRIVE_API_TOKEN');
  if (!PIPEDRIVE_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'PIPEDRIVE_API_TOKEN is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const BASE = 'https://api.pipedrive.com/v1';

  try {
    // Fetch all pipelines and find the target one
    const pipelinesRes = await fetch(`${BASE}/pipelines?api_token=${PIPEDRIVE_API_TOKEN}`);
    const pipelinesData = await pipelinesRes.json();
    if (!pipelinesRes.ok) throw new Error(`Pipedrive pipelines error`);

    const pipelines = pipelinesData.data || [];
    const targetPipeline = pipelines.find((p: any) =>
      p.name.toLowerCase().includes(PIPELINE_NAME_FILTER.toLowerCase())
    );

    if (!targetPipeline) {
      return new Response(JSON.stringify({ error: `Pipeline "${PIPELINE_NAME_FILTER}" niet gevonden`, available: pipelines.map((p: any) => p.name) }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch stages for this pipeline
    const stagesRes = await fetch(`${BASE}/stages?api_token=${PIPEDRIVE_API_TOKEN}&pipeline_id=${targetPipeline.id}`);
    const stagesData = await stagesRes.json();
    if (!stagesRes.ok) throw new Error(`Pipedrive stages error`);
    const stages = (stagesData.data || []).sort((a: any, b: any) => a.order_nr - b.order_nr);

    // Fetch ALL deals with pagination
    const deals = await fetchAllDeals(BASE, PIPEDRIVE_API_TOKEN, targetPipeline.id);

    // Group deals by stage
    const dealsByStage: Record<number, any[]> = {};
    for (const deal of deals) {
      const stageId = deal.stage_id;
      if (!dealsByStage[stageId]) dealsByStage[stageId] = [];
      dealsByStage[stageId].push({
        id: deal.id,
        title: deal.title,
        value: deal.value || 0,
        currency: deal.currency,
        person_name: deal.person_name,
        org_name: deal.org_name,
        owner_name: deal.owner_name,
        expected_close_date: deal.expected_close_date,
        add_time: deal.add_time,
        status: deal.status,
      });
    }

    const stageColumns = stages.map((stage: any) => {
      const stageDeals = dealsByStage[stage.id] || [];
      return {
        id: stage.id,
        name: stage.name,
        order: stage.order_nr,
        deals_count: stageDeals.length,
        deals_value: stageDeals.reduce((sum: number, d: any) => sum + d.value, 0),
        deals: stageDeals,
      };
    });

    return new Response(JSON.stringify({
      pipeline: {
        id: targetPipeline.id,
        name: targetPipeline.name,
      },
      stages: stageColumns,
      total_deals: deals.length,
      total_value: deals.reduce((sum: number, d: any) => sum + (d.value || 0), 0),
      fetched_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Pipedrive fetch error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
