// Strava Webhook receiver
// - GET: handshake (hub.challenge validation)
// - POST: receive activity events and import the activity
//
// This function MUST be public (no JWT) — Strava calls it without auth.
// Security relies on STRAVA_WEBHOOK_VERIFY_TOKEN for the handshake and on
// validating that the owner_id matches a known strava_connections row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const SPORT_MAP: Record<string, string> = {
  Run: "run", Trail: "run", TrailRun: "run", VirtualRun: "run",
  Ride: "bike", VirtualRide: "bike", GravelRide: "bike", MountainBikeRide: "bike", EBikeRide: "bike",
  Swim: "swim",
  Walk: "walk", Hike: "walk",
  WeightTraining: "strength", Crossfit: "strength", Workout: "strength",
  Yoga: "mobility",
};
const EXPLOITED_SPORTS = new Set(["swim", "bike", "run"]);

function normalizeSport(raw: string): string {
  return SPORT_MAP[raw] || "other";
}

// --- Token encryption helpers (AES-256-GCM) ---
async function getEncryptionKey(): Promise<CryptoKey> {
  const hexKey = Deno.env.get("STRAVA_TOKEN_ENCRYPTION_KEY");
  if (!hexKey || hexKey.length < 64) {
    throw new Error("STRAVA_TOKEN_ENCRYPTION_KEY missing/invalid.");
  }
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) keyBytes[i] = parseInt(hexKey.substring(i * 2, i * 2 + 2), 16);
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function decryptToken(stored: string): Promise<string> {
  if (!stored.startsWith("enc:")) throw new Error("Token not encrypted.");
  const key = await getEncryptionKey();
  const parts = stored.split(":");
  const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(buf);
}
async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `enc:${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(buf)))}`;
}

async function getFreshAccessToken(supabase: any, conn: any): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(conn.token_expires_at);
  if (expiresAt > now) {
    return await decryptToken(conn.access_token);
  }
  const clientId = Deno.env.get("STRAVA_CLIENT_ID")!;
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET")!;
  const refresh = await decryptToken(conn.refresh_token);
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refresh, grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Strava token refresh failed");
  const data = await res.json();
  const encA = await encryptToken(data.access_token);
  const encR = await encryptToken(data.refresh_token);
  await supabase.from("strava_connections").update({
    access_token: encA, refresh_token: encR,
    token_expires_at: new Date(data.expires_at * 1000).toISOString(),
  }).eq("user_id", conn.user_id);
  return data.access_token;
}

async function processActivity(
  supabase: any,
  userId: string,
  accessToken: string,
  stravaActivityId: number,
  aspectType: string,
) {
  // Deletes — verify with Strava API that the activity is truly gone before
  // touching local records. This prevents a forged "delete" event (the webhook
  // POST endpoint must remain public for Strava, so payloads aren't authenticated)
  // from wiping a user's data.
  if (aspectType === "delete") {
    const verify = await fetch(
      `https://www.strava.com/api/v3/activities/${stravaActivityId}?include_all_efforts=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    // Strava returns 404 (and sometimes 401) when the activity has actually been deleted.
    // Any 2xx response means the activity still exists → reject the delete event as forged.
    if (verify.ok) {
      console.warn("Ignored forged delete: activity still exists on Strava", stravaActivityId);
      return { ignored: "forged_delete" };
    }
    if (verify.status !== 404 && verify.status !== 410 && verify.status !== 401) {
      console.warn("Skipping delete: unexpected Strava status", verify.status, stravaActivityId);
      return { ignored: "delete_verification_failed" };
    }
    const { data: existing } = await supabase
      .from("imported_activities")
      .select("id")
      .eq("user_id", userId)
      .eq("strava_id", stravaActivityId)
      .maybeSingle();
    if (existing) {
      await supabase.from("completed_workouts").delete().eq("imported_activity_id", existing.id);
      await supabase.from("imported_activities").delete().eq("id", existing.id);
    }
    return { deleted: true };
  }

  // Fetch activity detail (covers create + update)
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${stravaActivityId}?include_all_efforts=false`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    console.error("Strava activity fetch failed", res.status, await res.text());
    throw new Error(`Strava API ${res.status}`);
  }
  const a = await res.json();

  const sportNorm = normalizeSport(a.sport_type || a.type || "");
  const payload = {
    user_id: userId,
    strava_id: a.id,
    name: a.name || null,
    sport_type_raw: a.sport_type || a.type || null,
    sport_type_normalized: sportNorm,
    start_date: a.start_date || null,
    timezone: a.timezone || null,
    duration_seconds: a.elapsed_time || null,
    moving_time_seconds: a.moving_time || null,
    distance_meters: a.distance || null,
    elevation_gain_meters: a.total_elevation_gain || null,
    avg_heartrate: a.average_heartrate || null,
    max_heartrate: a.max_heartrate || null,
    avg_power: a.average_watts || null,
    max_power: a.max_watts || null,
    avg_speed: a.average_speed || null,
    max_speed: a.max_speed || null,
    calories: a.calories || null,
    splits_metric: a.splits_metric ?? null,
    laps: a.laps ?? null,
    details_fetched_at: new Date().toISOString(),
    raw_payload: {
      id: a.id, type: a.type, sport_type: a.sport_type,
      has_heartrate: a.has_heartrate, suffer_score: a.suffer_score,
    },
  };

  const { data: upserted, error: upErr } = await supabase
    .from("imported_activities")
    .upsert(payload, { onConflict: "user_id,strava_id" })
    .select("id, strava_id, sport_type_normalized, start_date, duration_seconds, moving_time_seconds, distance_meters, elevation_gain_meters, avg_heartrate, max_heartrate, avg_power, avg_speed, calories, name")
    .maybeSingle();

  if (upErr || !upserted) {
    console.error("Upsert imported_activities failed", upErr);
    throw new Error("DB upsert failed");
  }

  // Skip matching if not an exploited sport
  if (!EXPLOITED_SPORTS.has(sportNorm) || !upserted.start_date) {
    return { activity_id: upserted.id, matched: false };
  }

  // Check if completed_workout already exists (update case)
  const { data: existingCW } = await supabase
    .from("completed_workouts")
    .select("id, planned_workout_id")
    .eq("imported_activity_id", upserted.id)
    .maybeSingle();

  if (existingCW) {
    // Update flow: refresh metrics on existing completed_workout
    await supabase.from("completed_workouts").update({
      moving_time_seconds: upserted.moving_time_seconds,
      duration_seconds: upserted.duration_seconds,
      distance_meters: upserted.distance_meters,
      elevation_gain_meters: upserted.elevation_gain_meters,
      avg_heartrate: upserted.avg_heartrate,
      max_heartrate: upserted.max_heartrate,
      avg_power: upserted.avg_power,
      avg_speed: upserted.avg_speed,
      calories: upserted.calories,
      activity_name: upserted.name,
    }).eq("id", existingCW.id);
    return { activity_id: upserted.id, updated_completed: existingCW.id };
  }

  // Matching: find planned workout within ±2 days, same sport, not yet matched
  const actDate = new Date(upserted.start_date);
  const minDate = new Date(actDate.getTime() - 2 * 24 * 60 * 60 * 1000);
  const maxDate = new Date(actDate.getTime() + 2 * 24 * 60 * 60 * 1000);

  const { data: planned } = await supabase
    .from("planned_workouts")
    .select("id, sport_type, scheduled_date, duration_target_minutes, distance_target_km, workout_priority, status")
    .eq("user_id", userId)
    .eq("sport_type", sportNorm)
    .gte("scheduled_date", minDate.toISOString().split("T")[0])
    .lte("scheduled_date", maxDate.toISOString().split("T")[0]);

  const { data: alreadyMatched } = await supabase
    .from("completed_workouts")
    .select("planned_workout_id")
    .eq("user_id", userId)
    .not("planned_workout_id", "is", null);
  const matchedIds = new Set((alreadyMatched || []).map((c: any) => c.planned_workout_id));

  let bestMatch: any = null;
  let bestScore = 0;
  for (const pw of (planned || [])) {
    if (matchedIds.has(pw.id)) continue;
    if (pw.status === "completed") continue;
    if (!pw.scheduled_date) continue;
    const pwDate = new Date(pw.scheduled_date + "T12:00:00Z");
    const dayDiff = Math.abs(actDate.getTime() - pwDate.getTime()) / 86400000;
    if (dayDiff > 2) continue;
    let score = 10 - dayDiff * 3;
    if (pw.duration_target_minutes && upserted.moving_time_seconds) {
      const r = (upserted.moving_time_seconds / 60) / pw.duration_target_minutes;
      if (r >= 0.5 && r <= 2.0) score += 3;
      if (r >= 0.7 && r <= 1.5) score += 2;
    }
    if (dayDiff < 1) score += 5;
    if (score > bestScore) { bestScore = score; bestMatch = pw; }
  }

  const isMatched = bestMatch && bestScore >= 5;
  const durMin = upserted.moving_time_seconds ? Math.round(upserted.moving_time_seconds / 60) : null;
  const distKm = upserted.distance_meters ? Math.round(Number(upserted.distance_meters) / 100) / 10 : null;
  const sportLabel: Record<string, string> = { swim: "natation", bike: "vélo", run: "course à pied" };

  let shortAnalysis = "";
  let conformity = "pending";
  let matchingStatus = "unmatched";
  let requiresReview = false;

  if (isMatched) {
    matchingStatus = "matched";
    conformity = "conform";
    shortAnalysis = `✅ Séance appariée à la séance planifiée du ${bestMatch.scheduled_date}.`;
  } else {
    matchingStatus = "free_workout";
    conformity = "free_workout";
    shortAnalysis = `Séance libre de ${sportLabel[sportNorm] || sportNorm}`;
    if (durMin) shortAnalysis += ` (${durMin} min`;
    if (distKm) shortAnalysis += `, ${distKm} km`;
    if (durMin) shortAnalysis += ")";
    shortAnalysis += ". Cette activité n'était pas prévue dans ton plan.";
    if (upserted.moving_time_seconds && upserted.moving_time_seconds > 5400) {
      requiresReview = true;
      shortAnalysis += " ⚠️ Séance longue non planifiée.";
    }
  }

  const { data: cwInsert, error: cwErr } = await supabase
    .from("completed_workouts")
    .insert({
      user_id: userId,
      imported_activity_id: upserted.id,
      planned_workout_id: isMatched ? bestMatch.id : null,
      sport_type: sportNorm,
      matching_status: matchingStatus,
      conformity_status: conformity,
      start_date: upserted.start_date,
      duration_seconds: upserted.duration_seconds,
      moving_time_seconds: upserted.moving_time_seconds,
      distance_meters: upserted.distance_meters,
      elevation_gain_meters: upserted.elevation_gain_meters,
      avg_heartrate: upserted.avg_heartrate,
      max_heartrate: upserted.max_heartrate,
      avg_power: upserted.avg_power,
      avg_speed: upserted.avg_speed,
      calories: upserted.calories,
      activity_name: upserted.name,
      short_analysis: shortAnalysis,
      requires_adjustment_review: requiresReview,
    })
    .select("id")
    .maybeSingle();

  if (cwErr) console.error("completed_workouts insert failed", cwErr);

  if (isMatched) {
    await supabase.from("planned_workouts").update({ status: "completed" }).eq("id", bestMatch.id);
  }

  if (cwInsert) {
    await supabase.from("workout_analyses").insert({
      user_id: userId,
      completed_workout_id: cwInsert.id,
      analysis_type: "short",
      conformity_status: conformity,
      actual_summary: shortAnalysis,
      requires_adjustment_review: requiresReview,
    });
  }

  await supabase.from("strava_connections").update({
    last_import_at: new Date().toISOString(),
    import_activity_count: 1, // incremental — handled by separate counter if needed
  }).eq("user_id", userId);

  return { activity_id: upserted.id, matched: isMatched };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // --- Subscription validation handshake (GET) ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("STRAVA_WEBHOOK_VERIFY_TOKEN");

    if (mode === "subscribe" && token === expected && challenge) {
      return new Response(JSON.stringify({ "hub.challenge": challenge }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  // --- Event delivery (POST) ---
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let event: any;
  try {
    event = await req.json();
  } catch {
    return new Response("Bad request", { status: 400, headers: corsHeaders });
  }

  // Strava expects 200 within 2s — process in background.
  // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
  EdgeRuntime.waitUntil((async () => {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);

      // event: { object_type, object_id, aspect_type, owner_id, subscription_id, event_time, updates }
      const { object_type, object_id, aspect_type, owner_id } = event;
      if (object_type !== "activity") {
        console.log("Ignored non-activity event:", object_type);
        return;
      }

      const { data: conn } = await supabase
        .from("strava_connections")
        .select("*")
        .eq("strava_athlete_id", owner_id)
        .maybeSingle();

      if (!conn) {
        console.warn("No connection for owner_id", owner_id);
        return;
      }

      const accessToken = await getFreshAccessToken(supabase, conn);
      const result = await processActivity(supabase, conn.user_id, accessToken, object_id, aspect_type);
      console.log("Webhook processed", { owner_id, object_id, aspect_type, result });

      // Recalcul auto de la trajectoire après création/maj d'activité
      if (aspect_type === "create" || aspect_type === "update") {
        try {
          await fetch(`${supabaseUrl}/functions/v1/compute-trajectory`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ user_id: conn.user_id, trigger_event: "auto_after_webhook" }),
          });
        } catch (e) {
          console.error("compute-trajectory invoke failed (webhook):", e);
        }
      }
    } catch (err) {
      console.error("Webhook processing error", err);
    }
  })());

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
