import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Create an in-app notification for a user (and, best-effort, an email later).
// Caller must be authenticated; the recipient is looked up server-side.
// Body: { userId, orgId?, type, title, body?, link? }
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller } } = await asUser.auth.getUser()
    if (!caller) return json({ error: 'Unauthorized' }, 401)

    const b = await req.json()
    const userId = String(b.userId ?? '')
    const type = String(b.type ?? 'info')
    const title = String(b.title ?? '').slice(0, 200)
    if (!userId || !title) return json({ error: 'userId and title required' }, 400)
    // Don't notify yourself.
    if (userId === caller.id) return json({ ok: true, skipped: 'self' })

    const { error } = await admin.from('app_notifications').insert({
      user_id: userId,
      org_id: b.orgId ?? null,
      actor_id: caller.id,
      type,
      title,
      body: b.body ? String(b.body).slice(0, 1000) : null,
      link: b.link ? String(b.link).slice(0, 500) : null,
    })
    if (error) return json({ error: error.message }, 400)

    // Email delivery is intentionally deferred: it runs through Lovable's
    // managed email domain, which must be verified on this project first.
    // The in-app notification above is the reliable path.

    return json({ ok: true })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
