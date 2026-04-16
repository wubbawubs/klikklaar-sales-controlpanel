import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches all rows from a Supabase table, bypassing the default 1000-row limit.
 * Paginates in batches of 1000 using .range().
 */
export async function fetchAll<T = any>(
  table: string,
  query: {
    select?: string;
    eq?: [string, any][];
    order?: [string, { ascending: boolean }];
    filters?: (q: any) => any;
  } = {}
): Promise<T[]> {
  const batchSize = 1000;
  const all: T[] = [];
  let from = 0;

  while (true) {
    let q = supabase.from(table).select(query.select || '*');

    if (query.eq) {
      for (const [col, val] of query.eq) {
        q = q.eq(col, val);
      }
    }

    if (query.filters) {
      q = query.filters(q);
    }

    if (query.order) {
      q = q.order(query.order[0], query.order[1]);
    }

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
