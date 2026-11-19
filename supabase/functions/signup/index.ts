// Тіркелу: растау хатынсыз, бірден расталған аккаунт ашады.
// Бұл — ашық тіркелу эндпоинті (Supabase-тің өз signup-ы сияқты), сондықтан JWT тексерілмейді (verify_jwt: false);
// кіріс деректері осы жерде тексеріледі, ал service role кілті тек серверде қолданылады.
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://zannatbeksultan-pixel.github.io",
  "http://localhost:8765",
  "http://localhost:8000",
];

// Vercel-дегі сайт пен оның алдын ала көру нұсқалары: https://futbol-platform*.vercel.app
const VERCEL_ORIGIN_RE = /^https:\/\/futbol-platform[a-z0-9-]*\.vercel\.app$/;

function isAllowed(origin: string | null): origin is string {
  return !!origin && (ALLOWED_ORIGINS.includes(origin) || VERCEL_ORIGIN_RE.test(origin));
}

function corsHeaders(origin: string | null) {
  const allow = isAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

Deno.serve(async (req: Request) => {
  const headers = { ...corsHeaders(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });

  let body: { email?: unknown; password?: unknown } = {};
  try { body = await req.json(); } catch { /* бос дене */ }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers });
  }
  if (password.length < 6 || password.length > 72) {
    return new Response(JSON.stringify({ error: "weak_password" }), { status: 400, headers });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return new Response(JSON.stringify({ error: "already_registered" }), { status: 409, headers });
    }
    console.error("createUser failed:", error.message);
    return new Response(JSON.stringify({ error: "signup_failed" }), { status: 400, headers });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
});
