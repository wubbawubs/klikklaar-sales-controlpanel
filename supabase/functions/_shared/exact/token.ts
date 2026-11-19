// Exact OAuth2-tokenlogica zonder Deno- of Supabase-afhankelijkheden (testbaar in vitest).
// Opslag en fetch worden geïnjecteerd; client.ts koppelt ze aan finance_exact_connection en env.

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

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number | string; // Exact geeft seconden als string ("600")
}

export interface TokenRow {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
}

export interface TokenStore {
  read(): Promise<TokenRow | null>;
  save(row: TokenRow): Promise<void>;
}

export interface ExactOAuthConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/** Wisselt een authorization code of refresh token in bij `/api/oauth2/token`. */
// VERIFY tegen echte administratie: tokenpad, form-velden en foutstatus (400 invalid_grant) bij verlopen refresh token.
export async function requestTokenWith(
  cfg: ExactOAuthConfig,
  fetchFn: FetchFn,
  params: Record<string, string>,
): Promise<TokenResponse> {
  const body = new URLSearchParams({ ...params, client_id: cfg.clientId, client_secret: cfg.clientSecret });
  const res = await fetchFn(`${cfg.baseUrl}/api/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  const text = await res.text();
  // Exact geeft 400 (invalid_grant) bij een verlopen/al gebruikte refresh token.
  if (res.status === 400 || res.status === 401) throw new ExactAuthError(`Exact token → ${res.status} ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`Exact token → ${res.status} ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as TokenResponse;
  if (!json.access_token || !json.refresh_token) throw new ExactAuthError("Exact token-antwoord zonder tokens");
  return json;
}

export type Refresher = (refreshToken: string) => Promise<TokenResponse>;

export function createRefresher(cfg: ExactOAuthConfig, fetchFn: FetchFn): Refresher {
  return (refreshToken) => requestTokenWith(cfg, fetchFn, { grant_type: "refresh_token", refresh_token: refreshToken });
}

export function expiresAt(expiresIn: number | string, now: number = Date.now()): string {
  const secs = Number(expiresIn) || 600;
  return new Date(now + secs * 1000).toISOString();
}

const MARGIN_MS = 60_000;
const isValid = (row: TokenRow | null, now: number): row is TokenRow & { access_token: string } =>
  !!row?.access_token && !!row.expires_at && new Date(row.expires_at).getTime() > now + MARGIN_MS;

/**
 * Geeft een geldig access token. Ververst als `expires_at` binnen 60 s valt en slaat het nieuwe
 * (geroteerde) refresh token direct op. Faalt de refresh omdat een gelijktijdige run hetzelfde
 * refresh token al gebruikte, dan wordt de opslag opnieuw gelezen: een geldig nieuwer token wordt
 * gebruikt; is alleen het refresh token nieuwer, dan wordt daarmee één keer opnieuw ververst.
 */
export async function resolveAccessToken(
  store: TokenStore,
  refresh: Refresher,
  now: () => number = Date.now,
): Promise<string> {
  const row = await store.read();
  if (!row?.refresh_token) throw new ExactNotConnectedError();
  if (isValid(row, now())) return row.access_token;

  const refreshAndSave = async (refreshToken: string) => {
    const tok = await refresh(refreshToken);
    await store.save({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: expiresAt(tok.expires_in, now()) });
    return tok.access_token;
  };

  try {
    return await refreshAndSave(row.refresh_token);
  } catch (err) {
    const latest = await store.read().catch(() => null);
    if (isValid(latest, now())) return latest.access_token;
    if (latest?.refresh_token && latest.refresh_token !== row.refresh_token) return await refreshAndSave(latest.refresh_token);
    throw err;
  }
}
