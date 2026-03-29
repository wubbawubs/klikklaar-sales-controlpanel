import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Get all active employee SEs
    const { data: ses, error } = await supabase
      .from('sales_executives')
      .select('id')
      .eq('employment_type', 'employee')
      .eq('status', 'active');

    if (error) throw error;
    if (!ses || ses.length === 0) {
      return new Response(JSON.stringify({ message: 'No active employee SEs found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    for (const se of ses) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/pipedrive-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ sales_executive_id: se.id }),
        });
        const data = await res.json();
        results.push({ se_id: se.id, status: 'ok', ...data });
      } catch (e) {
        results.push({ se_id: se.id, status: 'error', error: String(e) });
      }
    }

    return new Response(JSON.stringify({ synced_count: ses.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
