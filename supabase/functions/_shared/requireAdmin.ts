import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// null = allowed. Allows an admin user's JWT, or the service-role key (cron/server calls).
export async function requireAdmin(req: Request, cors: Record<string, string>): Promise<Response | null> {
  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return deny(401, "Unauthorized");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (token === serviceKey) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return deny(401, "Unauthorized");
  const admin = createClient(url, serviceKey);
  const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: user.id });
  return isAdmin ? null : deny(403, "Forbidden: admin only");
}
