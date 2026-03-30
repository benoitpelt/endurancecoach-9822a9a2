import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPORT_MAP: Record<string, string> = {
  Run: "run", Trail: "run", TrailRun: "run", VirtualRun: "run",
  Ride: "bike", VirtualRide: "bike", GravelRide: "bike", MountainBikeRide: "bike", EBikeRide: "bike",
  Swim: "swim",
  Walk: "walk", Hike: "walk",
  WeightTraining: "strength", Crossfit: "strength", Workout: "strength",
  Yoga: "mobility",
};

function normalizeSport(raw: string): string {
  return SPORT_MAP[raw] || "other";
}

// --- Token encryption helpers (AES-256-GCM) ---
async function getEncryptionKey(): Promise<CryptoKey | null> {
  const hexKey = Deno.env.get("STRAVA_TOKEN_ENCRYPTION_KEY");
  if (!hexKey || hexKey.length < 64) return null;
  const keyBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) keyBytes[i] = parseInt(hexKey.substring(i * 2, i * 2 + 2), 16);
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function decryptToken(stored: string): Promise<string> {
  if (!stored.startsWith("enc:")) return stored; // legacy plaintext
  const key = await getEncryptionKey();
  if (!key) throw new Error("Encryption key missing, cannot decrypt tokens.");
  const parts = stored.split(":");
  const iv = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}

async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  if (!key) return plaintext;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const ivB64 = btoa(String.fromCharCode(...iv));
  const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuf)));
  return `enc:${ivB64}:${cipherB64}`;
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
    const stravaClientId = Deno.env.get("STRAVA_CLIENT_ID");
    const stravaClientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Non autorisé");

    const supabase = createClient(supabaseUrl, serviceKey);

    // Get strava connection and ensure valid token
    const { data: conn } = await supabase
      .from("strava_connections")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!conn) throw new Error("Aucune connexion Strava trouvée.");

    // Decrypt tokens
    let accessToken = await decryptToken(conn.access_token);
    const now = new Date();
    const expiresAt = new Date(conn.token_expires_at);

    if (expiresAt <= now) {
      if (!stravaClientId || !stravaClientSecret) throw new Error("Configuration Strava manquante.");
      const decryptedRefresh = await decryptToken(conn.refresh_token);
      const refreshRes = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: stravaClientId,
          client_secret: stravaClientSecret,
          refresh_token: decryptedRefresh,
          grant_type: "refresh_token",
        }),
      });
      if (!refreshRes.ok) throw new Error("Token Strava expiré, reconnexion nécessaire.");
      const refreshData = await refreshRes.json();
      accessToken = refreshData.access_token;

      // Re-encrypt new tokens before storing
      const encAccess = await encryptToken(refreshData.access_token);
      const encRefresh = await encryptToken(refreshData.refresh_token);
      await supabase.from("strava_connections").update({
        access_token: encAccess,
        refresh_token: encRefresh,
        token_expires_at: new Date(refreshData.expires_at * 1000).toISOString(),
      }).eq("user_id", user.id);
    }

    // Update status to importing
    await supabase.from("strava_connections").update({
      import_status: "importing",
    }).eq("user_id", user.id);

    // Fetch activities for last 6 months (fallback 3 months on error)
    const sixMonthsAgo = Math.floor(new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000).getTime() / 1000);
    const threeMonthsAgo = Math.floor(new Date(now.getTime() - 3 * 30 * 24 * 60 * 60 * 1000).getTime() / 1000);

    let allActivities: any[] = [];
    let usedFallback = false;

    try {
      allActivities = await fetchAllActivities(accessToken, sixMonthsAgo);
    } catch (e) {
      console.warn("6-month fetch failed, trying 3 months:", e);
      try {
        allActivities = await fetchAllActivities(accessToken, threeMonthsAgo);
        usedFallback = true;
      } catch (e2) {
        console.error("3-month fetch also failed:", e2);
        await supabase.from("strava_connections").update({ import_status: "error" }).eq("user_id", user.id);
        throw new Error("Impossible de récupérer les activités Strava.");
      }
    }

    if (allActivities.length === 0) {
      await supabase.from("strava_connections").update({
        import_status: "empty",
        last_import_at: new Date().toISOString(),
        import_activity_count: 0,
      }).eq("user_id", user.id);

      return new Response(JSON.stringify({
        success: true,
        count: 0,
        message: "Aucune activité trouvée sur cette période.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert activities
    let importedCount = 0;
    const batchSize = 50;

    for (let i = 0; i < allActivities.length; i += batchSize) {
      const batch = allActivities.slice(i, i + batchSize);
      const inserts = batch.map((a: any) => ({
        user_id: user.id,
        strava_id: a.id,
        name: a.name || null,
        sport_type_raw: a.sport_type || a.type || null,
        sport_type_normalized: normalizeSport(a.sport_type || a.type || ""),
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
        raw_payload: {
          id: a.id, type: a.type, sport_type: a.sport_type,
          has_heartrate: a.has_heartrate, suffer_score: a.suffer_score,
        },
      }));

      const { error: insertErr } = await supabase
        .from("imported_activities")
        .upsert(inserts, { onConflict: "user_id,strava_id", ignoreDuplicates: true });

      if (insertErr) {
        console.error("Insert batch error:", insertErr);
      } else {
        importedCount += batch.length;
      }
    }

    // Update connection status
    const finalStatus = importedCount === allActivities.length ? "success" : "partial";
    await supabase.from("strava_connections").update({
      import_status: finalStatus,
      last_import_at: new Date().toISOString(),
      import_activity_count: importedCount,
    }).eq("user_id", user.id);

    // After import, compute and store synthesis metrics
    await computeAndStoreMetrics(supabase, user.id);

    return new Response(JSON.stringify({
      success: true,
      count: importedCount,
      total: allActivities.length,
      status: finalStatus,
      fallback: usedFallback,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("strava-import error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erreur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function fetchAllActivities(accessToken: string, afterEpoch: number): Promise<any[]> {
  const allActivities: any[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&page=${page}&per_page=${perPage}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Strava API error (page ${page}):`, res.status, errText);
      throw new Error(`Strava API error: ${res.status}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    allActivities.push(...data);
    if (data.length < perPage) break;
    page++;

    if (page > 10) break;
  }

  return allActivities;
}

async function computeAndStoreMetrics(supabase: any, userId: string) {
  try {
    const { data: activities } = await supabase
      .from("imported_activities")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: false });

    if (!activities || activities.length === 0) return;

    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const recent = activities.filter((a: any) =>
      a.start_date && new Date(a.start_date) >= threeMonthsAgo
    );

    const byNormalizedSport: Record<string, any[]> = {};
    for (const a of recent) {
      const sport = a.sport_type_normalized || "other";
      if (!byNormalizedSport[sport]) byNormalizedSport[sport] = [];
      byNormalizedSport[sport].push(a);
    }

    const metricsToInsert: any[] = [];
    const observedAt = now.toISOString();

    const weekCount = Math.max(1, Math.ceil(
      (now.getTime() - threeMonthsAgo.getTime()) / (7 * 24 * 60 * 60 * 1000)
    ));

    for (const sport of ["swim", "bike", "run"]) {
      const sportActivities = byNormalizedSport[sport] || [];

      if (sportActivities.length > 0) {
        const totalSeconds = sportActivities.reduce(
          (s: number, a: any) => s + (a.moving_time_seconds || a.duration_seconds || 0), 0
        );
        const weeklyHours = totalSeconds / 3600 / weekCount;

        metricsToInsert.push({
          user_id: userId,
          metric_type: `weekly_volume_${sport}`,
          metric_value: Math.round(weeklyHours * 10) / 10,
          metric_unit: "hours",
          observed_at: observedAt,
          source_type: "strava_import",
          source_detail: `Computed from ${sportActivities.length} activities over ${weekCount} weeks`,
          confidence_score: sportActivities.length >= 5 ? 0.8 : 0.5,
        });

        const longestDuration = Math.max(
          ...sportActivities.map((a: any) => a.moving_time_seconds || a.duration_seconds || 0)
        );
        const longestDistance = Math.max(
          ...sportActivities.map((a: any) => a.distance_meters || 0)
        );

        metricsToInsert.push({
          user_id: userId,
          metric_type: `longest_${sport}`,
          metric_value: Math.round(longestDuration / 60),
          metric_unit: "minutes",
          observed_at: observedAt,
          source_type: "strava_import",
          source_detail: `Longest session: ${Math.round(longestDistance / 1000 * 10) / 10}km`,
          confidence_score: 0.9,
        });
      }
    }

    const totalActivities = recent.length;
    metricsToInsert.push({
      user_id: userId,
      metric_type: "weekly_frequency",
      metric_value: Math.round(totalActivities / weekCount * 10) / 10,
      metric_unit: "sessions/week",
      observed_at: observedAt,
      source_type: "strava_import",
      source_detail: `${totalActivities} activities over ${weekCount} weeks`,
      confidence_score: totalActivities >= 10 ? 0.8 : 0.5,
    });

    if (metricsToInsert.length > 0) {
      const { error: metricErr } = await supabase
        .from("athlete_metric_history")
        .insert(metricsToInsert);

      if (metricErr) console.error("Metrics insert error:", metricErr);
    }

    const enrichUpdate: Record<string, any> = {};
    const weeklyVolume: Record<string, number> = {};

    for (const sport of ["swim", "bike", "run"]) {
      const sportActs = byNormalizedSport[sport] || [];
      if (sportActs.length > 0) {
        const totalSec = sportActs.reduce(
          (s: number, a: any) => s + (a.moving_time_seconds || a.duration_seconds || 0), 0
        );
        weeklyVolume[sport] = Math.round(totalSec / 3600 / weekCount * 10) / 10;

        const longest = sportActs.reduce((best: any, a: any) => {
          const dur = a.moving_time_seconds || a.duration_seconds || 0;
          return dur > (best.moving_time_seconds || best.duration_seconds || 0) ? a : best;
        }, sportActs[0]);

        const longestMin = Math.round((longest.moving_time_seconds || longest.duration_seconds || 0) / 60);
        const longestKm = Math.round((longest.distance_meters || 0) / 1000 * 10) / 10;

        const fieldMap: Record<string, string> = {
          swim: "longest_recent_swim",
          bike: "longest_recent_bike",
          run: "longest_recent_run",
        };
        enrichUpdate[fieldMap[sport]] = `${longestMin}min / ${longestKm}km (Strava)`;
      }
    }

    enrichUpdate.weekly_volume_hours = weeklyVolume;
    enrichUpdate.current_frequency_per_week = Math.round(totalActivities / weekCount);
    enrichUpdate.sessions_per_week = Math.round(totalActivities / weekCount);

    const sportVolumes = Object.entries(weeklyVolume).filter(([, v]) => v > 0);
    if (sportVolumes.length > 0) {
      sportVolumes.sort(([, a], [, b]) => b - a);
      enrichUpdate.strongest_discipline = sportVolumes[0][0];
      enrichUpdate.weakest_discipline = sportVolumes[sportVolumes.length - 1][0];
    }

    const { data: existingEnriched } = await supabase
      .from("athlete_enriched_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingEnriched) {
      await supabase.from("athlete_enriched_profiles")
        .update(enrichUpdate)
        .eq("user_id", userId);
    } else {
      await supabase.from("athlete_enriched_profiles")
        .insert({ user_id: userId, ...enrichUpdate });
    }

  } catch (e) {
    console.error("computeAndStoreMetrics error:", e);
  }
}
