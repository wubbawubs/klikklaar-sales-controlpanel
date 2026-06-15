#!/usr/bin/env node
// One-off: create (or repair) the founder admin account.
// Reads SB_URL + SB_SERVICE_KEY from env. Idempotent — safe to re-run.
import { createClient } from '@supabase/supabase-js'

const EMAIL = process.env.NEW_EMAIL
const PASSWORD = process.env.NEW_PASSWORD
const FULL_NAME = process.env.NEW_FULL_NAME ?? EMAIL

const sb = createClient(process.env.SB_URL, process.env.SB_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 1. Create the auth user (or find existing)
let userId
const created = await sb.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: FULL_NAME },
})

if (created.error) {
  if (/already.*regist|exists/i.test(created.error.message)) {
    // find the existing user and reset the password so login is guaranteed
    const list = await sb.auth.admin.listUsers()
    const existing = list.data.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase())
    if (!existing) throw new Error('User exists but could not be located')
    userId = existing.id
    await sb.auth.admin.updateUserById(userId, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    })
    console.log(`↻ Existing user updated: ${EMAIL}`)
  } else {
    throw created.error
  }
} else {
  userId = created.data.user.id
  console.log(`✓ Created user: ${EMAIL}`)
}

// 2. Global super_admin role (idempotent)
{
  const { data: existing } = await sb
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .eq('role', 'super_admin')
    .maybeSingle()
  if (!existing) {
    const { error } = await sb.from('user_roles').insert({ user_id: userId, role: 'super_admin' })
    if (error) throw error
    console.log('✓ Granted super_admin')
  } else {
    console.log('· super_admin already present')
  }
}

// 3. Ensure the profile carries the full name (trigger creates it on insert)
await sb.from('profiles').update({ full_name: FULL_NAME, email: EMAIL, active: true }).eq('user_id', userId)

// 4. Membership of every organization as owner; first one is the default
const { data: orgs, error: orgErr } = await sb.from('organizations').select('id, slug, name')
if (orgErr) throw orgErr
let madeDefault = false
for (const org of orgs ?? []) {
  const { data: existing } = await sb
    .from('user_organizations')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (!existing) {
    const isDefault = !madeDefault
    const { error } = await sb.from('user_organizations').insert({
      user_id: userId,
      organization_id: org.id,
      role: 'owner',
      is_default: isDefault,
    })
    if (error) throw error
    if (isDefault) madeDefault = true
    console.log(`✓ Added to org "${org.name}" as owner${isDefault ? ' (default)' : ''}`)
  } else {
    console.log(`· already in org "${org.name}"`)
  }
}

console.log('\nDone. Login at the control panel with the email + password above.')
