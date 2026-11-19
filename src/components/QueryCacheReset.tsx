import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

/**
 * Leegt de query-cache zodra de ingelogde gebruiker wisselt of uitlogt, zodat een volgende
 * gebruiker in hetzelfde tabblad nooit data of toegangsrechten van de vorige ziet (o.a. ['finance', ...]).
 * Een eerste login (null -> id) leegt niet: daarvoor is de cache al leeg of bij uitloggen geleegd.
 */
export function QueryCacheReset() {
  const queryClient = useQueryClient();
  const userId = useAuth().user?.id ?? null;
  const previous = useRef<string | null>(userId);

  useEffect(() => {
    if (previous.current !== null && previous.current !== userId) queryClient.clear();
    previous.current = userId;
  }, [userId, queryClient]);

  return null;
}
