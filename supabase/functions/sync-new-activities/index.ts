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

const EXPLOITED_SPORTS = new Set(["swim", "bike", "run"]);

function normalizeSport(raw: string): string {
  return SPORT_MAP[raw] || "other";
}

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

    // Get strava connection
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

    // Determine "after" epoch: last import time or 30 days ago
    const lastImport = conn.last_import_at ? new Date(conn.last_import_at) : null;
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const afterDate = lastImport && lastImport > thirtyDaysAgo ? lastImport : thirtyDaysAgo;
    const afterEpoch = Math.floor(afterDate.getTime() / 1000);

    // Fetch new activities from Strava
    const newActivities: any[] = [];
    let page = 1;
    const perPage = 200;

    while (true) {
      const url = `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&page=${page}&per_page=${perPage}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        console.error(`Strava API error (page ${page}):`, res.status);
        throw new Error(`Erreur API Strava: ${res.status}`);
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      newActivities.push(...data);
      if (data.length < perPage) break;
      page++;
      if (page > 5) break;
    }

    if (newActivities.length === 0) {
      await supabase.from("strava_connections").update({
        last_import_at: now.toISOString(),
      }).eq("user_id", user.id);

      return new Response(JSON.stringify({
        success: true,
        new_activities: 0,
        completed_workouts_created: 0,
        message: "Aucune nouvelle activité trouvée.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get existing strava_ids to avoid duplicates
    const stravaIds = newActivities.map((a: any) => a.id);
    const { data: existing } = await supabase
      .from("imported_activities")
      .select("strava_id")
      .eq("user_id", user.id)
      .in("strava_id", stravaIds);

    const existingIds = new Set((existing || []).map((e: any) => e.strava_id));
    const trulyNew = newActivities.filter((a: any) => !existingIds.has(a.id));

    if (trulyNew.length === 0) {
      await supabase.from("strava_connections").update({
        last_import_at: now.toISOString(),
      }).eq("user_id", user.id);

      return new Response(JSON.stringify({
        success: true,
        new_activities: 0,
        completed_workouts_created: 0,
        message: "Toutes les activités étaient déjà importées.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Insert new activities into imported_activities
    const inserts = trulyNew.map((a: any) => ({
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

    const { data: insertedActivities, error: insertErr } = await supabase
      .from("imported_activities")
      .upsert(inserts, { onConflict: "user_id,strava_id", ignoreDuplicates: true })
      .select("id, strava_id, sport_type_normalized, start_date, duration_seconds, moving_time_seconds, distance_meters, elevation_gain_meters, avg_heartrate, max_heartrate, avg_power, avg_speed, calories, name");

    if (insertErr) {
      console.error("Insert error:", insertErr);
      throw new Error("Erreur lors de l'insertion des activités.");
    }

    // Get planned workouts for matching (next 7 days back and 2 days forward from each activity)
    const activityDates = (insertedActivities || [])
      .filter((a: any) => a.start_date)
      .map((a: any) => new Date(a.start_date));

    let plannedWorkouts: any[] = [];
    if (activityDates.length > 0) {
      const minDate = new Date(Math.min(...activityDates.map((d: Date) => d.getTime())) - 2 * 24 * 60 * 60 * 1000);
      const maxDate = new Date(Math.max(...activityDates.map((d: Date) => d.getTime())) + 2 * 24 * 60 * 60 * 1000);

      const { data: pw } = await supabase
        .from("planned_workouts")
        .select("id, sport_type, scheduled_date, duration_target_minutes, distance_target_km, session_goal, intensity_zone_label, structure_text, workout_priority, status")
        .eq("user_id", user.id)
        .gte("scheduled_date", minDate.toISOString().split("T")[0])
        .lte("scheduled_date", maxDate.toISOString().split("T")[0]);

      plannedWorkouts = pw || [];
    }

    // Get already matched planned_workout_ids to avoid double matching
    const { data: existingCompleted } = await supabase
      .from("completed_workouts")
      .select("planned_workout_id")
      .eq("user_id", user.id)
      .not("planned_workout_id", "is", null);

    const alreadyMatchedIds = new Set((existingCompleted || []).map((c: any) => c.planned_workout_id));

    // Matching logic
    const completedInserts: any[] = [];
    const matchedPlannedIds = new Set<string>();

    for (const activity of (insertedActivities || [])) {
      const sport = activity.sport_type_normalized;
      const isExploited = EXPLOITED_SPORTS.has(sport);
      const actDate = activity.start_date ? new Date(activity.start_date) : null;

      let bestMatch: any = null;
      let bestScore = 0;

      if (isExploited && actDate) {
        for (const pw of plannedWorkouts) {
          if (matchedPlannedIds.has(pw.id)) continue;
          if (alreadyMatchedIds.has(pw.id)) continue;
          if (pw.status === "completed") continue;
          if (pw.sport_type !== sport) continue;
          if (!pw.scheduled_date) continue;

          // Date proximity (within 2 days)
          const pwDate = new Date(pw.scheduled_date + "T12:00:00Z");
          const dayDiff = Math.abs(actDate.getTime() - pwDate.getTime()) / (24 * 60 * 60 * 1000);
          if (dayDiff > 2) continue;

          // Score: closer date = better
          let score = 10 - dayDiff * 3;

          // Duration coherence bonus
          if (pw.duration_target_minutes && activity.moving_time_seconds) {
            const actualMin = activity.moving_time_seconds / 60;
            const ratio = actualMin / pw.duration_target_minutes;
            if (ratio >= 0.5 && ratio <= 2.0) score += 3;
            if (ratio >= 0.7 && ratio <= 1.5) score += 2;
          }

          // Same day bonus
          if (dayDiff < 1) score += 5;

          if (score > bestScore) {
            bestScore = score;
            bestMatch = pw;
          }
        }
      }

      // Generate short analysis
      let shortAnalysis = "";
      let conformity = "pending";
      let matchingStatus = "unmatched";
      let requiresReview = false;

      if (bestMatch && bestScore >= 5) {
        matchedPlannedIds.add(bestMatch.id);
        matchingStatus = "matched";

        // Compute conformity
        const analysis = computeShortAnalysis(activity, bestMatch);
        shortAnalysis = analysis.text;
        conformity = analysis.conformity;
        requiresReview = analysis.requiresReview;
      } else if (isExploited) {
        matchingStatus = "free_workout";
        conformity = "free_workout";
        const durMin = activity.moving_time_seconds ? Math.round(activity.moving_time_seconds / 60) : null;
        const distKm = activity.distance_meters ? Math.round(Number(activity.distance_meters) / 1000 * 10) / 10 : null;
        shortAnalysis = `Séance libre de ${sportLabel(sport)}`;
        if (durMin) shortAnalysis += ` (${durMin} min`;
        if (distKm) shortAnalysis += `, ${distKm} km`;
        if (durMin) shortAnalysis += ")";
        shortAnalysis += ". Cette activité n'était pas prévue dans ton plan.";

        // Flag if long free workout
        if (activity.moving_time_seconds && activity.moving_time_seconds > 5400) {
          requiresReview = true;
          shortAnalysis += " ⚠️ Séance longue non planifiée — à surveiller pour la récupération.";
        }
      } else {
        matchingStatus = "ignored";
        conformity = "ignored";
        shortAnalysis = `Activité de type "${sport}" importée mais non exploitée dans le coaching V1.`;
      }

      completedInserts.push({
        user_id: user.id,
        imported_activity_id: activity.id,
        planned_workout_id: bestMatch?.id || null,
        sport_type: sport,
        matching_status: matchingStatus,
        conformity_status: conformity,
        start_date: activity.start_date,
        duration_seconds: activity.duration_seconds,
        moving_time_seconds: activity.moving_time_seconds,
        distance_meters: activity.distance_meters,
        elevation_gain_meters: activity.elevation_gain_meters,
        avg_heartrate: activity.avg_heartrate,
        max_heartrate: activity.max_heartrate,
        avg_power: activity.avg_power,
        avg_speed: activity.avg_speed,
        calories: activity.calories,
        activity_name: activity.name,
        short_analysis: shortAnalysis,
        requires_adjustment_review: requiresReview,
      });

      // Update planned_workout status if matched
      if (bestMatch) {
        await supabase.from("planned_workouts").update({ status: "completed" }).eq("id", bestMatch.id);
      }
    }

    // Insert completed_workouts
    let createdCount = 0;
    if (completedInserts.length > 0) {
      const { data: created, error: cwErr } = await supabase
        .from("completed_workouts")
        .upsert(completedInserts, { onConflict: "imported_activity_id", ignoreDuplicates: true })
        .select("id, completed_workout_id:id, conformity_status, short_analysis, requires_adjustment_review, planned_workout_id");

      if (cwErr) {
        console.error("completed_workouts insert error:", cwErr);
      } else {
        createdCount = (created || []).length;

        // Insert short analyses into workout_analyses
        const analysisInserts = (created || []).map((cw: any) => ({
          user_id: user.id,
          completed_workout_id: cw.id,
          analysis_type: "short",
          conformity_status: cw.conformity_status,
          actual_summary: cw.short_analysis,
          requires_adjustment_review: cw.requires_adjustment_review,
        }));

        if (analysisInserts.length > 0) {
          await supabase.from("workout_analyses").insert(analysisInserts);
        }
      }
    }

    // Update connection
    await supabase.from("strava_connections").update({
      last_import_at: now.toISOString(),
      import_activity_count: (conn.import_activity_count || 0) + trulyNew.length,
    }).eq("user_id", user.id);

    // Check for vigilance: key workouts not found
    const vigilanceSignals: string[] = [];
    const unmatchedKeyWorkouts = plannedWorkouts.filter(
      (pw: any) => pw.workout_priority === "key" && !matchedPlannedIds.has(pw.id) && !alreadyMatchedIds.has(pw.id) && pw.status !== "completed"
    );
    if (unmatchedKeyWorkouts.length > 0) {
      vigilanceSignals.push(`${unmatchedKeyWorkouts.length} séance(s) clé(s) non retrouvée(s) dans tes activités récentes.`);
    }

    const reviewNeeded = completedInserts.filter((c: any) => c.requires_adjustment_review).length;
    if (reviewNeeded > 0) {
      vigilanceSignals.push(`${reviewNeeded} activité(s) nécessitant une attention particulière.`);
    }

    return new Response(JSON.stringify({
      success: true,
      new_activities: trulyNew.length,
      completed_workouts_created: createdCount,
      vigilance_signals: vigilanceSignals,
      message: `${trulyNew.length} nouvelle(s) activité(s) synchronisée(s).`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("sync-new-activities error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erreur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function sportLabel(sport: string): string {
  const labels: Record<string, string> = { swim: "natation", bike: "vélo", run: "course à pied" };
  return labels[sport] || sport;
}

function computeShortAnalysis(activity: any, planned: any): { text: string; conformity: string; requiresReview: boolean } {
  const parts: string[] = [];
  let conformScore = 0;
  let totalChecks = 0;
  let requiresReview = false;

  const actualDurMin = activity.moving_time_seconds ? Math.round(activity.moving_time_seconds / 60) : null;
  const plannedDurMin = planned.duration_target_minutes;
  const actualDistKm = activity.distance_meters ? Math.round(Number(activity.distance_meters) / 1000 * 10) / 10 : null;
  const plannedDistKm = planned.distance_target_km ? Number(planned.distance_target_km) : null;

  // Duration check
  if (actualDurMin && plannedDurMin) {
    totalChecks++;
    const ratio = actualDurMin / plannedDurMin;
    if (ratio >= 0.85 && ratio <= 1.15) {
      conformScore++;
      parts.push(`Durée conforme (${actualDurMin} min / ${plannedDurMin} min prévues).`);
    } else if (ratio >= 0.6 && ratio <= 1.4) {
      conformScore += 0.5;
      parts.push(`Durée partiellement conforme (${actualDurMin} min / ${plannedDurMin} min prévues).`);
    } else {
      parts.push(`Écart de durée notable (${actualDurMin} min / ${plannedDurMin} min prévues).`);
      if (planned.workout_priority === "key") requiresReview = true;
    }
  }

  // Distance check
  if (actualDistKm && plannedDistKm) {
    totalChecks++;
    const ratio = actualDistKm / plannedDistKm;
    if (ratio >= 0.85 && ratio <= 1.15) {
      conformScore++;
      parts.push(`Distance conforme (${actualDistKm} km / ${plannedDistKm} km).`);
    } else if (ratio >= 0.6 && ratio <= 1.4) {
      conformScore += 0.5;
      parts.push(`Distance partiellement conforme (${actualDistKm} km / ${plannedDistKm} km).`);
    } else {
      parts.push(`Écart de distance notable (${actualDistKm} km / ${plannedDistKm} km).`);
    }
  }

  // Determine conformity
  let conformity = "conform";
  if (totalChecks === 0) {
    conformity = "conform";
    parts.push("Données insuffisantes pour une comparaison détaillée — séance considérée comme réalisée.");
  } else {
    const ratio = conformScore / totalChecks;
    if (ratio >= 0.8) conformity = "conform";
    else if (ratio >= 0.4) conformity = "partial";
    else {
      conformity = "non_conform";
      requiresReview = true;
    }
  }

  const label = conformity === "conform" ? "✅ Séance conforme" 
    : conformity === "partial" ? "⚠️ Séance partiellement conforme"
    : "❌ Séance non conforme";

  return {
    text: `${label}. ${parts.join(" ")}`,
    conformity,
    requiresReview,
  };
}
