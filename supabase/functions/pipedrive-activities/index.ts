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
    if (req.method === 'GET') {
      // Get activities for an org or person
      const url = new URL(req.url);
      const orgId = url.searchParams.get('org_id');
      const personId = url.searchParams.get('person_id');
      const dealId = url.searchParams.get('deal_id');
      const done = url.searchParams.get('done'); // 0 or 1

      let apiUrl = `${BASE}/activities?api_token=${PIPEDRIVE_API_TOKEN}&limit=100`;
      if (done !== null) apiUrl += `&done=${done}`;

      // Filter by entity
      if (orgId) {
        apiUrl = `${BASE}/organizations/${orgId}/activities?api_token=${PIPEDRIVE_API_TOKEN}&limit=100`;
        if (done !== null) apiUrl += `&done=${done}`;
      } else if (personId) {
        apiUrl = `${BASE}/persons/${personId}/activities?api_token=${PIPEDRIVE_API_TOKEN}&limit=100`;
        if (done !== null) apiUrl += `&done=${done}`;
      } else if (dealId) {
        apiUrl = `${BASE}/deals/${dealId}/activities?api_token=${PIPEDRIVE_API_TOKEN}&limit=100`;
        if (done !== null) apiUrl += `&done=${done}`;
      }

      const res = await fetch(apiUrl);
      const data = await res.json();
      if (!res.ok) throw new Error(`Pipedrive activities error [${res.status}]`);

      const activities = (data.data || []).map((a: any) => ({
        id: a.id,
        type: a.type,
        subject: a.subject,
        note: a.note,
        done: a.done,
        due_date: a.due_date,
        due_time: a.due_time,
        duration: a.duration,
        person_name: a.person_name,
        org_name: a.org_name,
        deal_title: a.deal_title,
        owner_name: a.owner_name,
        add_time: a.add_time,
        marked_as_done_time: a.marked_as_done_time,
        org_id: a.org_id,
        person_id: a.person_id,
        deal_id: a.deal_id,
      }));

      return new Response(JSON.stringify({ activities }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      // Create a new activity in Pipedrive
      const body = await req.json();
      const { subject, type, org_id, person_id, deal_id, note, due_date, due_time, duration, done } = body;

      const activityData: any = {
        subject: subject || 'Belpoging',
        type: type || 'call',
      };
      if (org_id) activityData.org_id = org_id;
      if (person_id) activityData.person_id = person_id;
      if (deal_id) activityData.deal_id = deal_id;
      if (note) activityData.note = note;
      if (due_date) activityData.due_date = due_date;
      if (due_time) activityData.due_time = due_time;
      if (duration) activityData.duration = duration;
      if (done !== undefined) activityData.done = done ? 1 : 0;

      const res = await fetch(`${BASE}/activities?api_token=${PIPEDRIVE_API_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activityData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(`Pipedrive create activity error [${res.status}]: ${JSON.stringify(data)}`);

      return new Response(JSON.stringify({
        success: true,
        activity: {
          id: data.data.id,
          subject: data.data.subject,
          type: data.data.type,
          done: data.data.done,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (req.method === 'PUT') {
      // Update an activity in Pipedrive
      const body = await req.json();
      const { activity_id, ...updates } = body;

      if (!activity_id) {
        return new Response(JSON.stringify({ error: 'activity_id is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (updates.done !== undefined) updates.done = updates.done ? 1 : 0;

      const res = await fetch(`${BASE}/activities/${activity_id}?api_token=${PIPEDRIVE_API_TOKEN}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(`Pipedrive update activity error [${res.status}]: ${JSON.stringify(data)}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Pipedrive activities error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
