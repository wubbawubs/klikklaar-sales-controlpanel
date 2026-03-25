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
    const search = url.searchParams.get('search') || '';
    const start = parseInt(url.searchParams.get('start') || '0');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const orgId = url.searchParams.get('org_id');

    // Get single organization with persons
    if (orgId) {
      const [orgRes, personsRes] = await Promise.all([
        fetch(`${BASE}/organizations/${orgId}?api_token=${PIPEDRIVE_API_TOKEN}`),
        fetch(`${BASE}/organizations/${orgId}/persons?api_token=${PIPEDRIVE_API_TOKEN}&start=0&limit=100`),
      ]);

      const orgData = await orgRes.json();
      const personsData = await personsRes.json();

      if (!orgRes.ok) throw new Error(`Pipedrive org error [${orgRes.status}]`);

      const persons = (personsData.data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        email: p.email?.map((e: any) => e.value).filter(Boolean) || [],
        phone: p.phone?.map((ph: any) => ph.value).filter(Boolean) || [],
        job_title: p.job_title,
      }));

      return new Response(JSON.stringify({
        organization: {
          id: orgData.data.id,
          name: orgData.data.name,
          address: orgData.data.address,
          owner_name: orgData.data.owner_name,
          people_count: orgData.data.people_count,
          open_deals_count: orgData.data.open_deals_count,
          won_deals_count: orgData.data.won_deals_count,
          lost_deals_count: orgData.data.lost_deals_count,
        },
        persons,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Search or list organizations
    let apiUrl: string;
    if (search) {
      apiUrl = `${BASE}/organizations/search?api_token=${PIPEDRIVE_API_TOKEN}&term=${encodeURIComponent(search)}&start=${start}&limit=${limit}&fields=name,address`;
    } else {
      apiUrl = `${BASE}/organizations?api_token=${PIPEDRIVE_API_TOKEN}&start=${start}&limit=${limit}&sort=name ASC`;
    }

    const res = await fetch(apiUrl);
    const data = await res.json();
    if (!res.ok) throw new Error(`Pipedrive error [${res.status}]: ${JSON.stringify(data)}`);

    let organizations: any[];
    let hasMore = false;

    if (search) {
      organizations = (data.data?.items || []).map((item: any) => {
        const org = item.item;
        return {
          id: org.id,
          name: org.name,
          address: org.visible_to === undefined ? org.address : undefined,
          owner_name: org.owner?.name,
          people_count: org.people_count,
          open_deals_count: org.open_deals_count,
        };
      });
      hasMore = data.additional_data?.pagination?.more_items_in_collection || false;
    } else {
      organizations = (data.data || []).map((org: any) => ({
        id: org.id,
        name: org.name,
        address: org.address,
        owner_name: org.owner_name,
        people_count: org.people_count,
        open_deals_count: org.open_deals_count,
      }));
      hasMore = data.additional_data?.pagination?.more_items_in_collection || false;
    }

    return new Response(JSON.stringify({
      organizations,
      has_more: hasMore,
      total: data.additional_data?.pagination?.count || organizations.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Pipedrive organizations error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
