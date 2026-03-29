import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
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
  const url = new URL(req.url);
  const email = url.searchParams.get('email')?.trim().toLowerCase();

  if (!email) {
    return new Response(JSON.stringify({ error: 'email parameter is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Search for user by email in Pipedrive
    const usersRes = await fetch(`${BASE}/users?api_token=${PIPEDRIVE_API_TOKEN}`);
    const usersData = await usersRes.json();
    if (!usersRes.ok) throw new Error(`Pipedrive users error [${usersRes.status}]`);

    const users = usersData.data || [];
    const matched = users.find((u: any) => u.email?.toLowerCase() === email);

    if (matched) {
      return new Response(JSON.stringify({
        found: true,
        user: {
          id: matched.id,
          name: matched.name,
          email: matched.email,
          active_flag: matched.active_flag,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Also search in persons
    const personsRes = await fetch(
      `${BASE}/persons/search?term=${encodeURIComponent(email)}&fields=email&api_token=${PIPEDRIVE_API_TOKEN}`
    );
    const personsData = await personsRes.json();
    const personItems = personsData.data?.items || [];
    const matchedPerson = personItems.find((p: any) =>
      p.item?.emails?.some((e: string) => e.toLowerCase() === email)
    );

    return new Response(JSON.stringify({
      found: !!matchedPerson,
      user: matchedPerson ? {
        id: matchedPerson.item.id,
        name: matchedPerson.item.name,
        email: email,
        type: 'person',
      } : null,
      pipedrive_user: null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Pipedrive user check error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
