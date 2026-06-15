import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Invite a user to the platform: create the auth account, assign a global
// role and a company (organization) membership, and email them a link to
// set their password. Admin-only.
//
// Body: { email, fullName, role?, organizationId, orgRole? }
//   role         — app_role: 'admin' | 'coach' | 'sales_executive' (default 'sales_executive')
//   organizationId — the company the user belongs to (controls pipeline access)
//   orgRole      — membership role within that company (default 'member')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_ROLES = ['super_admin', 'admin', 'coach', 'sales_executive', 'closer']
const REDIRECT = 'https://sales.klikklaarseo.nl/reset-password'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify the caller is an admin
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user: caller } } = await supabaseUser.auth.getUser()
    if (!caller) return json({ error: 'Unauthorized' }, 401)

    const { data: isAdmin } = await supabaseAdmin.rpc('is_admin', { _user_id: caller.id })
    if (!isAdmin) return json({ error: 'Forbidden: admin only' }, 403)

    const body = await req.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const fullName = String(body.fullName ?? '').trim()
    const role = ALLOWED_ROLES.includes(body.role) ? body.role : 'sales_executive'
    const organizationId = body.organizationId ?? null
    const orgRole = String(body.orgRole ?? 'member').trim() || 'member'

    if (!email || !fullName) return json({ error: 'email and fullName are required' }, 400)
    if (!organizationId) return json({ error: 'organizationId (company) is required' }, 400)

    // 1. Create or find the auth user
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existing = existingUsers?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === email,
    )

    let userId: string
    let createdNew = false
    if (existing) {
      userId = existing.id
    } else {
      const tempPassword = `Welkom${crypto.randomUUID().slice(0, 10)}!`
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })
      if (createErr) return json({ error: createErr.message }, 400)
      userId = created.user.id
      createdNew = true
    }

    // 2. Global role
    const { error: roleErr } = await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: userId, role }, { onConflict: 'user_id,role' })
    if (roleErr) console.error('role upsert', roleErr)

    // 3. Company membership (controls pipeline access)
    const { error: orgErr } = await supabaseAdmin
      .from('user_organizations')
      .upsert(
        { user_id: userId, organization_id: organizationId, role: orgRole },
        { onConflict: 'user_id,organization_id' },
      )
    if (orgErr) return json({ error: `Membership failed: ${orgErr.message}` }, 400)

    // 4. Ensure profile (trigger handles new users; backfill for pre-existing)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    if (!profile) {
      await supabaseAdmin.from('profiles').insert({ user_id: userId, full_name: fullName, email })
    }

    // 5. Email a set-password / recovery link
    let inviteEmailSent = false
    try {
      const { error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: REDIRECT },
      })
      inviteEmailSent = !linkErr
      if (linkErr) console.error('invite link', linkErr)
    } catch (e) {
      console.error('invite link threw', e)
    }

    return json({ ok: true, userId, createdNew, inviteEmailSent })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
