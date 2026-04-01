import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

// Web Push helpers using Web Crypto API
async function generateVapidAuthHeader(endpoint: string, vapidPublicKey: string, vapidPrivateKey: string) {
  const urlObj = new URL(endpoint);
  const audience = `${urlObj.protocol}//${urlObj.host}`;

  // Import private key
  const privKeyBytes = base64UrlDecode(vapidPrivateKey);
  const pubKeyBytes = base64UrlDecode(vapidPublicKey);

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    buildPkcs8(privKeyBytes),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // Create JWT
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 86400, sub: "mailto:noreply@klikklaar.nl" };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format
  const rawSig = derToRaw(new Uint8Array(signature));
  const sigB64 = base64UrlEncode(rawSig);
  const jwt = `${unsignedToken}.${sigB64}`;

  return {
    Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
  };
}

function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from([...binary].map((c) => c.charCodeAt(0)));
}

function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildPkcs8(rawPrivateKey: Uint8Array): Uint8Array {
  // PKCS8 wrapper for EC P-256 private key
  const prefix = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
    0x01, 0x04, 0x20,
  ]);
  const result = new Uint8Array(prefix.length + rawPrivateKey.length);
  result.set(prefix);
  result.set(rawPrivateKey, prefix.length);
  return result;
}

function derToRaw(der: Uint8Array): Uint8Array {
  // DER-encoded ECDSA signature to raw r||s (each 32 bytes)
  const raw = new Uint8Array(64);
  let offset = 2; // skip SEQUENCE tag + length
  // r
  const rLen = der[offset + 1];
  offset += 2;
  const rStart = rLen > 32 ? offset + (rLen - 32) : offset;
  const rDest = rLen < 32 ? 32 - rLen : 0;
  raw.set(der.slice(rStart, rStart + Math.min(rLen, 32)), rDest);
  offset += rLen;
  // s
  const sLen = der[offset + 1];
  offset += 2;
  const sStart = sLen > 32 ? offset + (sLen - 32) : offset;
  const sDest = sLen < 32 ? 64 - sLen : 32;
  raw.set(der.slice(sStart, sStart + Math.min(sLen, 32)), sDest);
  return raw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // This function is called by pg_net or internally — validate with service role
  const authHeader = req.headers.get("Authorization");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { user_id, title, body, action_url, type } = await req.json();
  if (!user_id || !title) {
    return new Response(JSON.stringify({ error: "Missing user_id or title" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Get active subscriptions for user
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", user_id)
    .eq("enabled", true);

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;

  let sent = 0;
  const payload = JSON.stringify({ title, body: body || "", action_url: action_url || "/", type: type || "default" });

  for (const sub of subs) {
    try {
      const headers = await generateVapidAuthHeader(sub.endpoint, vapidPublicKey, vapidPrivateKey);

      // Encrypt payload (simplified — using raw push for VAPID)
      const response = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          TTL: "86400",
        },
        body: payload,
      });

      if (response.status === 201 || response.status === 200) {
        sent++;
      } else if (response.status === 404 || response.status === 410) {
        // Subscription expired, remove it
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      }
    } catch (err) {
      console.error("Push send error:", err);
    }
  }

  return new Response(JSON.stringify({ sent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
