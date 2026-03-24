import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    // Fetch all pipelines
    const pipelinesRes = await fetch(`${BASE}/pipelines?api_token=${PIPEDRIVE_API_TOKEN}`);
    const pipelinesData = await pipelinesRes.json();
    if (!pipelinesRes.ok) {
      throw new Error(`Pipedrive pipelines error [${pipelinesRes.status}]: ${JSON.stringify(pipelinesData)}`);
    }

    const pipelines = pipelinesData.data || [];

    // Fetch stages for all pipelines
    const stagesRes = await fetch(`${BASE}/stages?api_token=${PIPEDRIVE_API_TOKEN}`);
    const stagesData = await stagesRes.json();
    if (!stagesRes.ok) {
      throw new Error(`Pipedrive stages error [${stagesRes.status}]: ${JSON.stringify(stagesData)}`);
    }

    const stages = stagesData.data || [];

    // Fetch deal summary per stage (open deals)
    const dealsRes = await fetch(`${BASE}/deals?api_token=${PIPEDRIVE_API_TOKEN}&status=open&limit=500`);
    const dealsData = await dealsRes.json();
    if (!dealsRes.ok) {
      throw new Error(`Pipedrive deals error [${dealsRes.status}]: ${JSON.stringify(dealsData)}`);
    }

    const deals = dealsData.data || [];

    // Group deals by stage
    const dealsByStage: Record<number, { count: number; value: number; deals: any[] }> = {};
    for (const deal of deals) {
      const stageId = deal.stage_id;
      if (!dealsByStage[stageId]) {
        dealsByStage[stageId] = { count: 0, value: 0, deals: [] };
      }
      dealsByStage[stageId].count++;
      dealsByStage[stageId].value += deal.value || 0;
      dealsByStage[stageId].deals.push({
        id: deal.id,
        title: deal.title,
        value: deal.value,
        currency: deal.currency,
        person_name: deal.person_name,
        org_name: deal.org_name,
        add_time: deal.add_time,
        update_time: deal.update_time,
        expected_close_date: deal.expected_close_date,
        owner_name: deal.owner_name,
      });
    }

    // Build funnel per pipeline
    const funnels = pipelines.map((pipeline: any) => {
      const pipelineStages = stages
        .filter((s: any) => s.pipeline_id === pipeline.id)
        .sort((a: any, b: any) => a.order_nr - b.order_nr)
        .map((stage: any) => ({
          id: stage.id,
          name: stage.name,
          order: stage.order_nr,
          deals_count: dealsByStage[stage.id]?.count || 0,
          deals_value: dealsByStage[stage.id]?.value || 0,
          deals: dealsByStage[stage.id]?.deals || [],
        }));

      return {
        id: pipeline.id,
        name: pipeline.name,
        active: pipeline.active,
        stages: pipelineStages,
        total_deals: pipelineStages.reduce((sum: number, s: any) => sum + s.deals_count, 0),
        total_value: pipelineStages.reduce((sum: number, s: any) => sum + s.deals_value, 0),
      };
    });

    return new Response(JSON.stringify({ funnels, fetched_at: new Date().toISOString() }), {
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
