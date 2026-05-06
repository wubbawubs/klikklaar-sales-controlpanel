/** Apply an optional organization_id .eq() filter to a Supabase query builder. */
export function withOrg<T>(q: T, orgId: string | null | undefined): T {
  if (!orgId) return q;
  // @ts-ignore — runtime supabase query builder has .eq()
  return q.eq('organization_id', orgId);
}
