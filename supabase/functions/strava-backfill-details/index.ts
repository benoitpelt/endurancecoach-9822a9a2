// Récupère les détails (splits_metric + laps) des activités Strava déjà importées.
// Traite par lots pour respecter les rate limits Strava (100 req / 15 min).
// Le client doit rappeler tant que `done: false`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 25; // marge sous les 100 req / 15 min
const DELAY_MS = 1200; // délai entre appels Strava

// --- Token encryption helpers (AES-256-GCM) ---
async function getEncryptionKey(): Promise<CryptoKey> {
  const hexKey = Deno.env.get("STRAVA_TOKEN_ENCRYPTION_KEY");
  if (!hexKey || hexKey.length < 64) {
    throw new Error("STRAVA_TOKEN_ENCRYPTION_KEY is missing or invalid (must be 64 hex chars).");
  }
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) keyBytes[i] = parseInt(hexKey.substring(i * 2, i * 2 + 2), 16);
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function decryptToken(stored: string): Promise<string> {
  if (!stored.startsWith("enc:")) {
    throw new Error("Stored Strava token is not encrypted. Reconnect Strava to re-encrypt.");
  }
  const key = await getEncryptionKey();
  const parts = stored.split(":");
  const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}

async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const ivB64 = btoa(String.fromCharCode(...iv));
  const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuf)));
  return `enc:${ivB64}:${cipherB64}`;
}

async function ensureAccessToken(supabase: any, userId: string): Promise<string> {
  const { data: conn } = await supabase
    .from("strava_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!conn) throw new Error("Aucune connexion Strava trouvée.");

  let accessToken = await decryptToken(conn.access_token);
  const now = new Date();
  const expiresAt = new Date(conn.token_expires_at);

  if (expiresAt > now) return accessToken;

  const clientId = Deno.env.get("STRAVA_CLIENT_ID");
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Configuration Strava manquante.");

  const decryptedRefresh = await decryptToken(conn.refresh_token);
  const refreshRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptedRefresh,
      grant_type: "refresh_token",
    }),
  });
  if (!refreshRes.ok) throw new Error("Token Strava expiré, reconnexion nécessaire.");
  const refreshData = await refreshRes.json();
  accessToken = refreshData.access_token;

  const encAccess = await encryptToken(refreshData.access_token);
  const encRefresh = await encryptToken(refreshData.refresh_token);
  await supabase.from("strava_connections").update({
    access_token: encAccess,
    refresh_token: encRefresh,
    token_expires_at: new Date(refreshData.expires_at * 1000).toISOString(),
  }).eq("user_id", userId);

  return accessToken;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non autorisé");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Non autorisé");

    const supabase = createClient(supabaseUrl, serviceKey);

    // Compte le total restant (avant traitement)
    const { count: pendingBefore } = await supabase
      .from("imported_activities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("details_fetched_at", null)
      .in("sport_type_normalized", ["swim", "bike", "run"]);

    // Récupère le prochain lot (plus récent d'abord)
    const { data: pending, error: pendingErr } = await supabase
      .from("imported_activities")
      .select("id, strava_id")
      .eq("user_id", user.id)
      .is("details_fetched_at", null)
      .in("sport_type_normalized", ["swim", "bike", "run"])
      .order("start_date", { ascending: false })
      .limit(BATCH_SIZE);

    if (pendingErr) throw pendingErr;

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        done: true,
        processed: 0,
        remaining: 0,
        errors: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accessToken = await ensureAccessToken(supabase, user.id);

    let processed = 0;
    let errors = 0;
    let rateLimited = false;

    for (let i = 0; i < pending.length; i++) {
      const act = pending[i];
      try {
        const res = await fetch(
          `https://www.strava.com/api/v3/activities/${act.strava_id}?include_all_efforts=false`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (res.status === 429) {
          // Rate limit atteint — on s'arrête proprement
          rateLimited = true;
          console.warn("Strava rate limit hit, stopping batch.");
          break;
        }

        if (!res.ok) {
          console.error(`Strava detail fetch failed for ${act.strava_id}: ${res.status}`);
          errors++;
          // Marque quand même comme tenté pour éviter de boucler dessus
          await supabase.from("imported_activities")
            .update({ details_fetched_at: new Date().toISOString() })
            .eq("id", act.id);
          continue;
        }

        const detail = await res.json();
        await supabase.from("imported_activities").update({
          splits_metric: detail.splits_metric ?? null,
          laps: detail.laps ?? null,
          details_fetched_at: new Date().toISOString(),
        }).eq("id", act.id);

        processed++;
      } catch (e) {
        console.error("Backfill error for activity", act.strava_id, e);
        errors++;
      }

      // Délai entre appels, sauf après le dernier
      if (i < pending.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    const remaining = Math.max(0, (pendingBefore ?? 0) - processed);
    const done = remaining === 0 && !rateLimited;

    return new Response(JSON.stringify({
      success: true,
      done,
      processed,
      errors,
      remaining,
      rate_limited: rateLimited,
      total_before: pendingBefore ?? 0,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("strava-backfill-details error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erreur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
