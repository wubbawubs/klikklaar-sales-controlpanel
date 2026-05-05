// Calendly webhook: invitee.created / invitee.canceled -> closer_appointments
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, calendly-webhook-signature',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNING_KEY = Deno.env.get('CALENDLY_WEBHOOK_SIGNING_KEY') || '';

async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!SIGNING_KEY) {
    console.warn('CALENDLY_WEBHOOK_SIGNING_KEY not set, rejecting webhook');
    return false;
  }
  if (!header) return false;
  // Calendly format: "t=<timestamp>,v1=<signature>"
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(SIGNING_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${rawBody}`));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === v1;
}

function pickHiddenField(payload: any, name: string): string | null {
  const tracking = payload?.tracking || {};
  const utm = tracking[`utm_${name}`] || tracking.utm_source;
  if (utm) return String(utm);
  const qa = payload?.questions_and_answers || [];
  for (const q of qa) {
    const text = String(q?.question || '').toLowerCase();
    if (text.includes(name)) return String(q?.answer || '') || null;
  }
  return null;
}

async function pickNextCloser(supabase: any): Promise<string | null> {
  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'closer');
  const closerIds: string[] = (roles || []).map((r: any) => r.user_id);
  if (closerIds.length === 0) return null;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id')
    .in('user_id', closerIds)
    .neq('active', false);
  const active: string[] = (profiles || []).map((p: any) => p.user_id);
  if (active.length === 0) return closerIds[0];

  const { data: state } = await supabase
    .from('closer_round_robin_state')
    .select('last_assigned_closer_user_id')
    .eq('id', 1)
    .maybeSingle();
  const last = state?.last_assigned_closer_user_id;
  let next = active[0];
  if (last) {
    const idx = active.indexOf(last);
    next = active[(idx + 1) % active.length];
  }
  await supabase
    .from('closer_round_robin_state')
    .update({ last_assigned_closer_user_id: next, updated_at: new Date().toISOString() })
    .eq('id', 1);
  return next;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Health ping
  try {
    const peek = await req.clone().json().catch(() => null);
    if (peek?.ping === true) {
      return new Response(JSON.stringify({ ok: true, ping: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch { /* noop */ }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get('calendly-webhook-signature');

  if (SIGNING_KEY) {
    const ok = await verifySignature(rawBody, sigHeader);
    if (!ok) {
      console.warn('Invalid Calendly signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } else {
    // No signing key configured = refuse, never silently accept
    return new Response(JSON.stringify({ error: 'Signing key not configured' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body: any;
  try { body = JSON.parse(rawBody); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const event = body?.event as string;
  const payload = body?.payload || {};
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const inviteeUri = payload?.uri || payload?.invitee?.uri || null;
    const eventUri = payload?.event || payload?.scheduled_event?.uri || null;
    const inviteeName = payload?.name || payload?.invitee?.name || null;
    const inviteeEmail = payload?.email || payload?.invitee?.email || null;
    const scheduledAt = payload?.scheduled_event?.start_time || payload?.event_start_time || null;

    if (event === 'invitee.created') {
      const callerId = pickHiddenField(payload, 'caller_se_id') || pickHiddenField(payload, 'se_id');
      const phone = pickHiddenField(payload, 'phone');
      const orgName = pickHiddenField(payload, 'company') || pickHiddenField(payload, 'bedrijf');

      const closerUserId = await pickNextCloser(supabase);
      if (!closerUserId) {
        console.error('No active closer available');
        return new Response(JSON.stringify({ error: 'No closer available' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Best-effort match to existing lead by email or company
      let leadAssignmentId: string | null = null;
      if (inviteeEmail || orgName) {
        const { data: leads } = await supabase
          .from('lead_assignments')
          .select('id')
          .or([
            inviteeEmail ? `person_email.eq.${inviteeEmail}` : null,
            orgName ? `org_name.eq.${orgName}` : null,
          ].filter(Boolean).join(','))
          .limit(1);
        leadAssignmentId = leads?.[0]?.id ?? null;
      }

      const insert = {
        closer_user_id: closerUserId,
        caller_sales_executive_id: callerId || null,
        lead_assignment_id: leadAssignmentId,
        status: 'call',
        org_name: orgName,
        contact_name: inviteeName,
        contact_email: inviteeEmail,
        contact_phone: phone,
        scheduled_at: scheduledAt,
        calendly_event_uri: eventUri,
        calendly_invitee_uri: inviteeUri,
        metadata_json: { raw: payload },
      };

      const { error: insErr } = await supabase
        .from('closer_appointments')
        .upsert(insert, { onConflict: 'calendly_invitee_uri' });
      if (insErr) {
        console.error('Insert failed', insErr);
        return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Notify the closer
      await supabase.from('notifications').insert({
        user_id: closerUserId,
        title: 'Nieuwe afspraak ingepland',
        body: `${orgName || inviteeName || 'Nieuwe lead'} | ${scheduledAt ? new Date(scheduledAt).toLocaleString('nl-NL') : 'tijd onbekend'}`,
        type: 'closer_appointment',
        action_url: '/closer',
      });

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (event === 'invitee.canceled') {
      if (inviteeUri) {
        await supabase
          .from('closer_appointments')
          .update({ status: 'no_show', updated_at: new Date().toISOString() })
          .eq('calendly_invitee_uri', inviteeUri);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, ignored: event }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('calendly-webhook error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Unknown' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
