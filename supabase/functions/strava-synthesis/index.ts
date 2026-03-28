import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    // Fetch imported activities
    const { data: activities } = await supabase
      .from("imported_activities")
      .select("*")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false });

    if (!activities || activities.length === 0) {
      return new Response(JSON.stringify({
        synthesis: null,
        message: "Aucune activité importée.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    const recent = activities.filter((a: any) =>
      a.start_date && new Date(a.start_date) >= threeMonthsAgo
    );

    const all = activities.filter((a: any) =>
      a.start_date && new Date(a.start_date) >= sixMonthsAgo
    );

    // Group by sport
    const bySport: Record<string, any[]> = {};
    for (const a of all) {
      const sport = a.sport_type_normalized || "other";
      if (!bySport[sport]) bySport[sport] = [];
      bySport[sport].push(a);
    }

    const weekCount6m = Math.max(1, Math.ceil(
      (now.getTime() - sixMonthsAgo.getTime()) / (7 * 24 * 60 * 60 * 1000)
    ));
    const weekCount3m = Math.max(1, Math.ceil(
      (now.getTime() - threeMonthsAgo.getTime()) / (7 * 24 * 60 * 60 * 1000)
    ));

    // Compute synthesis
    const sportSummaries: Record<string, any> = {};
    const prioritySports = ["swim", "bike", "run"];

    for (const sport of prioritySports) {
      const sportActs = bySport[sport] || [];
      const recentSportActs = sportActs.filter((a: any) =>
        a.start_date && new Date(a.start_date) >= threeMonthsAgo
      );

      if (sportActs.length === 0) continue;

      const totalDuration = sportActs.reduce(
        (s: number, a: any) => s + (a.moving_time_seconds || a.duration_seconds || 0), 0
      );
      const totalDistance = sportActs.reduce(
        (s: number, a: any) => s + (a.distance_meters || 0), 0
      );

      const recentTotalDuration = recentSportActs.reduce(
        (s: number, a: any) => s + (a.moving_time_seconds || a.duration_seconds || 0), 0
      );

      // Find longest
      const longest = sportActs.reduce((best: any, a: any) => {
        const dur = a.moving_time_seconds || a.duration_seconds || 0;
        return dur > (best.moving_time_seconds || best.duration_seconds || 0) ? a : best;
      }, sportActs[0]);

      const longestMin = Math.round((longest.moving_time_seconds || longest.duration_seconds || 0) / 60);
      const longestKm = Math.round((longest.distance_meters || 0) / 1000 * 10) / 10;

      sportSummaries[sport] = {
        count_total: sportActs.length,
        count_recent: recentSportActs.length,
        weekly_frequency: Math.round(sportActs.length / weekCount6m * 10) / 10,
        weekly_volume_hours: Math.round(totalDuration / 3600 / weekCount6m * 10) / 10,
        recent_weekly_volume_hours: Math.round(recentTotalDuration / 3600 / weekCount3m * 10) / 10,
        total_distance_km: Math.round(totalDistance / 1000),
        longest_session_min: longestMin,
        longest_session_km: longestKm,
        longest_session_name: longest.name,
      };
    }

    // Overall stats
    const totalAllSec = all.reduce(
      (s: number, a: any) => s + (a.moving_time_seconds || a.duration_seconds || 0), 0
    );
    const recentAllSec = recent.reduce(
      (s: number, a: any) => s + (a.moving_time_seconds || a.duration_seconds || 0), 0
    );

    const overallWeeklyHours6m = Math.round(totalAllSec / 3600 / weekCount6m * 10) / 10;
    const overallWeeklyHours3m = Math.round(recentAllSec / 3600 / weekCount3m * 10) / 10;

    // Regularity: count weeks with at least 1 activity
    const weekBuckets = new Set<string>();
    for (const a of all) {
      if (!a.start_date) continue;
      const d = new Date(a.start_date);
      const weekStart = new Date(d);
      weekStart.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
      weekBuckets.add(weekStart.toISOString().split("T")[0]);
    }
    const activeWeeks = weekBuckets.size;
    const regularityPct = Math.round(activeWeeks / weekCount6m * 100);

    // Trend
    let trend = "stable";
    if (overallWeeklyHours3m > overallWeeklyHours6m * 1.15) trend = "ascending";
    else if (overallWeeklyHours3m < overallWeeklyHours6m * 0.85) trend = "descending";

    // Confirmed vs uncertain points
    const confirmed: string[] = [];
    const uncertain: string[] = [];

    if (all.length >= 20) {
      confirmed.push(`Entraînement régulier avec ${all.length} séances sur 6 mois`);
    }
    if (regularityPct >= 70) {
      confirmed.push(`Bonne régularité (${regularityPct}% des semaines actives)`);
    }

    for (const sport of prioritySports) {
      const s = sportSummaries[sport];
      if (s && s.count_total >= 10) {
        const labels: Record<string, string> = { swim: "Natation", bike: "Vélo", run: "Course" };
        confirmed.push(`${labels[sport]} : ${s.weekly_frequency} séances/semaine en moyenne`);
      }
    }

    if (trend === "ascending") confirmed.push("Tendance récente en hausse");
    if (trend === "descending") uncertain.push("Volume en baisse récemment — fatigue ou pause ?");

    if (all.length < 15) uncertain.push("Peu de données — les estimations sont approximatives");
    if (regularityPct < 50) uncertain.push("Entraînement irrégulier — difficile de déduire un rythme stable");

    const sportNames: Record<string, string> = { swim: "Natation", bike: "Vélo", run: "Course" };

    // Impact assessment
    const impacts: string[] = [];
    if (Object.keys(sportSummaries).length > 0) {
      impacts.push("Volume et fréquence d'entraînement mis à jour dans le profil");
    }
    for (const sport of prioritySports) {
      if (sportSummaries[sport]?.longest_session_min > 0) {
        impacts.push(`${sportNames[sport]} : séance longue identifiée (${sportSummaries[sport].longest_session_min} min)`);
      }
    }

    // Check if plan exists
    const { data: plans } = await supabase
      .from("training_plans")
      .select("id, name, status")
      .eq("user_id", user.id)
      .in("status", ["active", "draft"])
      .limit(1);

    const hasPlan = plans && plans.length > 0;

    const synthesis = {
      period_months: 6,
      total_activities: all.length,
      recent_activities: recent.length,
      overall_weekly_hours_6m: overallWeeklyHours6m,
      overall_weekly_hours_3m: overallWeeklyHours3m,
      weekly_frequency: Math.round(all.length / weekCount6m * 10) / 10,
      regularity_pct: regularityPct,
      active_weeks: activeWeeks,
      total_weeks: weekCount6m,
      trend,
      sport_summaries: sportSummaries,
      confirmed,
      uncertain,
      impacts,
      has_existing_plan: hasPlan,
      existing_plan: hasPlan ? plans![0] : null,
    };

    return new Response(JSON.stringify({ synthesis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("strava-synthesis error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erreur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
