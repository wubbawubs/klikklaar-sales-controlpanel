import { useOrganization } from '@/hooks/useOrganization';

/** Returns the active organization id, or null while loading / for super_admin "all" view. */
export function useOrgId(): string | null {
  const { current } = useOrganization();
  return current?.id ?? null;
}
