import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches all rows from a Supabase table, bypassing the default 1000-row limit.
 * Paginates in batches of 1000 using .range().
 */
export async function fetchAll<T = any>(
  table: string,
  buildQuery: (base: ReturnType<typeof supabase.from>) => any
): Promise<T[]> {
  const batchSize = 1000;
  const all: T[] = [];
  let from = 0;

  while (true) {
    const base = (supabase as any).from(table);
    const q = buildQuery(base);
    const { data, error } = await q.range(from, from + batchSize - 1);
    if (error) {
      console.error(`fetchAll(${table}) error:`, error.message);
      break;
    }
    const batch = (data as T[]) || [];
    all.push(...batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return all;
}
