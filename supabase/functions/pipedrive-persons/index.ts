import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BASE = 'https://api.pipedrive.com/v1';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const PIPEDRIVE_API_TOKEN = Deno.env.get('PIPEDRIVE_API_TOKEN');
  if (!PIPEDRIVE_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'PIPEDRIVE_API_TOKEN is not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const personId = url.searchParams.get('person_id');
    const search = url.searchParams.get('search') || '';
    const orgId = url.searchParams.get('org_id');

    // Get single person with details
    if (personId) {
      const res = await fetch(`${BASE}/persons/${personId}?api_token=${PIPEDRIVE_API_TOKEN}`);
      const data = await res.json();
      if (!res.ok) throw new Error(`Pipedrive person error [${res.status}]`);

      const p = data.data;
      return new Response(JSON.stringify({
        person: {
          id: p.id,
          name: p.name,
          email: p.email?.map((e: any) => e.value).filter(Boolean) || [],
          phone: p.phone?.map((ph: any) => ph.value).filter(Boolean) || [],
          job_title: p.job_title,
          org_id: p.org_id,
          org_name: p.org_name,
          owner_name: p.owner_name,
          open_deals_count: p.open_deals_count,
          won_deals_count: p.won_deals_count,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get persons by org
    if (orgId) {
      const res = await fetch(`${BASE}/organizations/${orgId}/persons?api_token=${PIPEDRIVE_API_TOKEN}&start=0&limit=100`);
      const data = await res.json();
      if (!res.ok) throw new Error(`Pipedrive persons error [${res.status}]`);

      const persons = (data.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        email: p.email?.map((e: any) => e.value).filter(Boolean) || [],
        phone: p.phone?.map((ph: any) => ph.value).filter(Boolean) || [],
        job_title: p.job_title,
        org_id: p.org_id,
      }));

      return new Response(JSON.stringify({ persons }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Search persons
    if (search) {
      const res = await fetch(`${BASE}/persons/search?api_token=${PIPEDRIVE_API_TOKEN}&term=${encodeURIComponent(search)}&limit=50&fields=name,email,phone`);
      const data = await res.json();
      if (!res.ok) throw new Error(`Pipedrive search error [${res.status}]`);

      const persons = (data.data?.items || []).map((item: any) => {
        const p = item.item;
        return {
          id: p.id,
          name: p.name,
          email: p.emails || [],
          phone: p.phones || [],
          org_name: p.organization?.name,
          org_id: p.organization?.id,
        };
      });

      return new Response(JSON.stringify({ persons }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // List all persons
    const start = parseInt(url.searchParams.get('start') || '0');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const res = await fetch(`${BASE}/persons?api_token=${PIPEDRIVE_API_TOKEN}&start=${start}&limit=${limit}&sort=name ASC`);
    const data = await res.json();
    if (!res.ok) throw new Error(`Pipedrive persons error [${res.status}]`);

    const persons = (data.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      email: p.email?.map((e: any) => e.value).filter(Boolean) || [],
      phone: p.phone?.map((ph: any) => ph.value).filter(Boolean) || [],
      job_title: p.job_title,
      org_name: typeof p.org_id === 'object' ? p.org_id?.name : p.org_name,
      org_id: typeof p.org_id === 'object' ? p.org_id?.value : p.org_id,
    }));

    return new Response(JSON.stringify({
      persons,
      has_more: data.additional_data?.pagination?.more_items_in_collection || false,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Pipedrive persons error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
