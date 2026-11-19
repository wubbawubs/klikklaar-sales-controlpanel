// Exact Online REST-client: OAuth2-tokens (in finance_exact_connection, alleen service role) en
// gepagineerde GET's met rate-limitbewaking. Bronnen: Exact "REST API" en "OAuth 2.0" developer-docs.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const EXACT_BASE_URL = (Deno.env.get("EXACT_BASE_URL") ?? "https://start.exactonline.nl").replace(/\/+$/, "");

export class ExactAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExactAuthError";
  }
}

export class ExactNotConnectedError extends Error {
  constructor() {
    super("Exact niet gekoppeld");
    this.name = "ExactNotConnectedError";
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number | string; // Exact geeft seconden als string ("600")
}

/** Wisselt een authorization code of refresh token in bij `/api/oauth2/token`. */
// VERIFY tegen echte administratie: tokenpad, form-velden en foutstatus (400 invalid_grant) bij verlopen refresh token.
export async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({
    ...params,
    client_id: Deno.env.get("EXACT_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("EXACT_CLIENT_SECRET") ?? "",
  });
  const res = await fetch(`${EXACT_BASE_URL}/api/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const text = await res.text();
  // Exact geeft 400 (invalid_grant) bij een verlopen/al gebruikte refresh token.
  if (res.status === 400 || res.status === 401) throw new ExactAuthError(`Exact token → ${res.status} ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`Exact token → ${res.status} ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as TokenResponse;
  if (!json.access_token || !json.refresh_token) throw new ExactAuthError("Exact token-antwoord zonder tokens");
  return json;
}

export function expiresAt(expiresIn: number | string): string {
  const secs = Number(expiresIn) || 600;
  return new Date(Date.now() + secs * 1000).toISOString();
}

/**
 * Geeft een geldig access token. Ververst als `expires_at` binnen 60 s valt en slaat het nieuwe
 * refresh token direct op (Exact roteert refresh tokens; het oude is daarna ongeldig).
 */
export async function getAccessToken(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from("finance_exact_connection")
    .select("access_token, refresh_token, expires_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(`finance_exact_connection: ${error.message}`);
  if (!data?.refresh_token) throw new ExactNotConnectedError();

  const exp = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (data.access_token && exp > Date.now() + 60_000) return data.access_token;

  const tok = await requestToken({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  const { error: upErr } = await admin
    .from("finance_exact_connection")
    .update({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: expiresAt(tok.expires_in) })
    .eq("id", 1);
  if (upErr) throw new Error(`finance_exact_connection opslaan: ${upErr.message}`);
  return tok.access_token;
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
