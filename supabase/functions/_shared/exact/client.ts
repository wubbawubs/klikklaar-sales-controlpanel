// Exact Online REST-client: OAuth2-tokens (in finance_exact_connection, alleen service role) en
// gepagineerde GET's met rate-limitbewaking. Bronnen: Exact "REST API" en "OAuth 2.0" developer-docs.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  createRefresher,
  ExactAuthError,
  type ExactOAuthConfig,
  requestTokenWith,
  resolveAccessToken,
  type TokenResponse,
  type TokenRow,
} from "./token.ts";

export { ExactAuthError, ExactNotConnectedError, expiresAt } from "./token.ts";

export const EXACT_BASE_URL = (Deno.env.get("EXACT_BASE_URL") ?? "https://start.exactonline.nl").replace(/\/+$/, "");

function oauthConfig(): ExactOAuthConfig {
  return {
    baseUrl: EXACT_BASE_URL,
    clientId: Deno.env.get("EXACT_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("EXACT_CLIENT_SECRET") ?? "",
  };
}

/** Wisselt een authorization code of refresh token in bij `/api/oauth2/token`. */
export function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  return requestTokenWith(oauthConfig(), fetch, params);
}

/**
 * Geeft een geldig access token (zie resolveAccessToken in token.ts): ververst binnen 60 s van
 * expiry, slaat het geroteerde refresh token op en vangt een gelijktijdige refresh door een andere
 * run op door de verbinding opnieuw te lezen.
 */
export function getAccessToken(admin: SupabaseClient): Promise<string> {
  const store = {
    async read(): Promise<TokenRow | null> {
      const { data, error } = await admin
        .from("finance_exact_connection")
        .select("access_token, refresh_token, expires_at")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw new Error(`finance_exact_connection: ${error.message}`);
      return data as TokenRow | null;
    },
    async save(row: TokenRow): Promise<void> {
      const { error } = await admin.from("finance_exact_connection").update(row).eq("id", 1);
      if (error) throw new Error(`finance_exact_connection opslaan: ${error.message}`);
    },
  };
  return resolveAccessToken(store, createRefresher(oauthConfig(), fetch));
}

export interface ExactGetOptions {
  /** OData-queryparameters, bijv. { $select: "ID,Code", $filter: "Type eq 12" }. */
  query?: Record<string, string>;
  /** Stop na zoveel rijen (veiligheidsgrens). */
  maxRows?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Exact: max. 60 calls per minuut per administratie (en een dagelijks limiet). Bij bijna-op wachten
// tot de reset (X-RateLimit-Minutely-Reset = epoch in ms).
// VERIFY tegen echte administratie: headernamen en dat Reset in epoch-milliseconden is.
async function respectRateLimit(res: Response): Promise<void> {
  const remaining = Number(res.headers.get("X-RateLimit-Minutely-Remaining"));
  const reset = Number(res.headers.get("X-RateLimit-Minutely-Reset"));
  if (res.headers.has("X-RateLimit-Minutely-Remaining") && remaining <= 2 && reset > 0) {
    const wait = Math.min(Math.max(reset - Date.now(), 0) + 250, 65_000);
    await sleep(wait);
  }
}

/**
 * GET op een Exact REST-pad (bijv. `/api/v1/123/financial/GLAccounts`) en volgt `d.__next` tot
 * alle pagina's binnen zijn. Gooit `ExactAuthError` bij 401.
 */
export async function exactGetAll<T>(token: string, path: string, opts: ExactGetOptions = {}): Promise<T[]> {
  const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : "";
  let url: string | null = path.startsWith("http") ? path : `${EXACT_BASE_URL}${path}${qs}`;
  const out: T[] = [];
  const maxRows = opts.maxRows ?? 100_000;
  let throttled = 0;

  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (res.status === 401) throw new ExactAuthError(`Exact ${path} → 401`);
    if (res.status === 429) {
      if (++throttled > 3) throw new Error(`Exact ${path} → 429 (rate limit)`);
      await res.body?.cancel();
      await respectRateLimit(res);
      const reset = Number(res.headers.get("X-RateLimit-Minutely-Reset"));
      if (!(reset > 0)) await sleep(60_000);
      continue;
    }
    const text: string = await res.text();
    if (!res.ok) throw new Error(`Exact ${path} → ${res.status} ${text.slice(0, 300)}`);
    const json: { d?: unknown } = text ? JSON.parse(text) : {};
    // OData v2: { d: { results: [...], __next?: url } } of { d: [...] }
    // VERIFY tegen echte administratie: __next is een absolute URL.
    const d = json?.d as T[] | { results?: T[]; __next?: string } | undefined;
    const rows: T[] = Array.isArray(d) ? d : (d?.results ?? []);
    out.push(...rows);
    if (out.length >= maxRows) break;
    url = Array.isArray(d) ? null : (d?.__next ?? null);
    await respectRateLimit(res);
  }
  return out;
}
