import { MutationCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from './errors';

/**
 * A failed save must never go unnoticed: every mutation error shows a toast, unless the mutation
 * handles it itself and sets `meta: { silent: true }`.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.meta?.silent) return;
        toast.error(`Opslaan mislukt: ${errorMessage(error, 'onbekende fout')}`);
      },
    }),
  });
}
