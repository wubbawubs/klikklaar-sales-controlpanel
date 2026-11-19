// Exact Online OAuth2 (authorization code).
//   GET|POST /exact-auth/start     (super_admin JWT) → { url } naar het Exact-inlogscherm
//   GET      /exact-auth/callback  (?code&state, van Exact, zonder JWT) → tokens opslaan, redirect naar de app
// Tokens staan in finance_exact_connection (RLS aan, geen policies): alleen de service role leest ze.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EXACT_BASE_URL, expiresAt, requestToken } from "../_shared/exact/client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = (Deno.env.get("APP_URL") ?? "https://sales.klikklaarseo.nl").replace(/\/+$/, "");
const STATE_TTL_MS = 10 * 60_000;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// ── state = `${userId}.${expiry}.${HMAC-SHA256(userId.expiry)}` ────────────────────────────────
const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function hmacKey(): Promise<CryptoKey> {
  // Service-role key als HMAC-sleutel: altijd aanwezig en nooit bij clients.
  return crypto.subtle.importKey("raw", enc.encode(SERVICE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signState(userId: string): Promise<string> {
  const payload = `${userId}.${Date.now() + STATE_TTL_MS}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}
async function verifyState(state: string): Promise<string | null> {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (!(Number(exp) > Date.now())) return null;
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = fromB64url(sig);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), sigBytes, enc.encode(`${userId}.${exp}`));
  return ok ? userId : null;
}

async function isSuperAdmin(userId: string): Promise<boolean> {
  const { data } = await admin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  return data === true;
}

function redirectToApp(status: "connected" | "error"): Response {
  return new Response(null, { status: 302, headers: { Location: `${APP_URL}/finance/bedrijven?exact=${status}` } });
}

async function start(req: Request): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ error: "Unauthorized" }, 401);
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!(await isSuperAdmin(user.id))) return json({ error: "Forbidden: super_admin only" }, 403);

  const clientId = Deno.env.get("EXACT_CLIENT_ID");
  const redirectUri = Deno.env.get("EXACT_REDIRECT_URI");
  if (!clientId || !redirectUri) return json({ error: "Exact-app niet geconfigureerd" }, 500);

  // VERIFY tegen echte administratie: pad /api/oauth2/auth, force_login, en dat Exact `state` ongewijzigd
  // teruggeeft in de callback.
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    force_login: "0",
    state: await signState(user.id),
  });
  return json({ url: `${EXACT_BASE_URL}/api/oauth2/auth?${params.toString()}` });
}

async function callback(url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return redirectToApp("error");

  const userId = await verifyState(state);
  if (!userId || !(await isSuperAdmin(userId))) return redirectToApp("error");

  try {
    const tok = await requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: Deno.env.get("EXACT_REDIRECT_URI") ?? "",
    });
    const { error } = await admin.from("finance_exact_connection").upsert({
      id: 1,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: expiresAt(tok.expires_in),
      connected_by: userId,
      connected_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("exact-auth callback:", e instanceof Error ? e.message : e);
    return redirectToApp("error");
  }
  return redirectToApp("connected");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  try {
    if (path.endsWith("/start") && (req.method === "GET" || req.method === "POST")) return await start(req);
    if (path.endsWith("/callback") && req.method === "GET") return await callback(url);
    return json({ error: "Not found" }, 404);
  } catch (e) {
    console.error("exact-auth:", e instanceof Error ? e.message : e);
    return json({ error: "Interne fout" }, 500);
  }
});
