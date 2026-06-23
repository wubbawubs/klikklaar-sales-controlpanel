// bunq → Liquiditeit sync. Does the bunq public-API handshake (installation →
// device → session), reads the monetary accounts and writes each balance into
// cash_positions as today's snapshot. The bunq API key stays server-side
// (BUNQ_API_KEY secret); handshake state is cached in bunq_state (service-role).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const API_KEY = Deno.env.get("BUNQ_API_KEY") ?? "";
const BASE = "https://api.bunq.com";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function pem(buf: Uint8Array, label: string): string {
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  const b64 = btoa(s).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

async function genKeys() {
  const kp = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  return { publicPem: pem(spki, "PUBLIC KEY"), privatePem: pem(pkcs8, "PRIVATE KEY") };
}

// bunq requires each call after installation to carry X-Bunq-Client-Signature:
// the request body signed (RSA-SHA256) with the private key whose public half
// was registered at installation. GET bodies are empty, so the empty string.
function pemToDer(pemStr: string): Uint8Array {
  const b64 = pemStr.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}
async function importPriv(pemStr: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey("pkcs8", pemToDer(pemStr),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}
async function signBody(key: CryptoKey, body: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(body)));
  let s = ""; for (const b of sig) s += String.fromCharCode(b);
  return btoa(s);
}

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "User-Agent": "klikklaar-controlpanel/1.0",
    "X-Bunq-Language": "nl_NL",
    "X-Bunq-Region": "nl_NL",
    "X-Bunq-Client-Request-Id": crypto.randomUUID(),
    "X-Bunq-Geolocation": "0 0 0 0 000",
  };
  if (token) h["X-Bunq-Client-Authentication"] = token;
  return h;
}

async function call(method: string, path: string, body?: unknown, token?: string, signKey?: CryptoKey): Promise<any> {
  const bodyStr = body !== undefined ? JSON.stringify(body) : "";
  const h = headers(token);
  if (signKey) h["X-Bunq-Client-Signature"] = await signBody(signKey, bodyStr);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: method === "GET" ? undefined : (body !== undefined ? bodyStr : undefined),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`bunq ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

// bunq responses are arrays of single-key objects: [{Id:..},{Token:..},..]
const pick = (arr: any[], key: string) => arr?.find((o) => o[key])?.[key] ?? null;
function pickUser(arr: any[]) {
  for (const o of arr ?? []) {
    for (const k of Object.keys(o)) if (k.startsWith("User") && o[k]?.id) return o[k];
  }
  return null;
}

async function openSession(): Promise<{ token: string; userId: string; signKey: CryptoKey }> {
  const { data: state } = await supabase.from("bunq_state").select("*").eq("id", 1).maybeSingle();
  let installationToken = state?.installation_token;
  let priv = state?.private_key, pub = state?.public_key;

  // Installation + device registration happen once and are cached immediately —
  // even before the session call — so a later failure never re-registers a device
  // or trips bunq's brute-force lock. Installation itself needs no signature; every
  // call after it does.
  if (!installationToken || !pub || !priv) {
    const keys = await genKeys();
    priv = keys.privatePem; pub = keys.publicPem;
    const newKey = await importPriv(priv);
    const inst = await call("POST", "/v1/installation", { client_public_key: pub });
    installationToken = pick(inst.Response, "Token")?.token;
    if (!installationToken) throw new Error("Geen installation token van bunq.");
    await call("POST", "/v1/device-server",
      { description: "klikklaar-controlpanel", secret: API_KEY, permitted_ips: ["*"] }, installationToken, newKey);
    await supabase.from("bunq_state").upsert({
      id: 1, private_key: priv, public_key: pub, installation_token: installationToken,
      updated_at: new Date().toISOString(),
    });
  }

  const signKey = await importPriv(priv);
  const sess = await call("POST", "/v1/session-server", { secret: API_KEY }, installationToken, signKey);
  const token = pick(sess.Response, "Token")?.token;
  const userId = String(pickUser(sess.Response)?.id ?? "");
  if (!token || !userId) throw new Error("Geen sessie/gebruiker van bunq.");

  await supabase.from("bunq_state").update({ user_id: userId, updated_at: new Date().toISOString() }).eq("id", 1);
  return { token, userId, signKey };
}

async function resolveOrgId(): Promise<string | null> {
  const { data } = await supabase.from("organizations").select("id, name").eq("active", true);
  const idea = (data ?? []).find((o) => /idea/i.test(o.name));
  return idea?.id ?? data?.[0]?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!API_KEY) return json({ configured: false });

  try {
    const session = await openSession();
    const accRes = await call("GET", `/v1/user/${session.userId}/monetary-account`, undefined, session.token, session.signKey);
    const orgId = await resolveOrgId();
    if (!orgId) throw new Error("Geen organisatie gevonden om saldi onder te zetten.");

    const today = new Date().toISOString().slice(0, 10);
    const accounts: { account: string; balance: number; currency: string }[] = [];
    for (const item of accRes.Response ?? []) {
      const a = item[Object.keys(item)[0]];
      if (!a || a.status !== "ACTIVE" || !a.balance) continue;
      const account = `bunq · ${a.description || a.id}`;
      const balance = Number(a.balance.value) || 0;
      accounts.push({ account, balance, currency: a.balance.currency });
      await supabase.from("cash_positions").upsert(
        { org_id: orgId, account, as_of: today, balance, note: "Auto-sync uit bunq" },
        { onConflict: "org_id,account,as_of" },
      );
    }

    await supabase.from("bunq_state").update({ last_sync: new Date().toISOString() }).eq("id", 1);
    return json({ configured: true, ok: true, synced: accounts.length, accounts });
  } catch (e) {
    return json({ configured: true, ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
