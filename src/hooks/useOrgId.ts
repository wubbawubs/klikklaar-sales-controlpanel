import { useOrganization } from '@/hooks/useOrganization';

/** Returns the active organization id, or null while loading / in the "Algemeen" group view. */
export function useOrgId(): string | null {
  const { current, isAllView } = useOrganization();
  if (isAllView) return null; // group view aggregates via allOrgIds, not a single org
  return current?.id ?? null;
}
