import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-admin-key, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

function extractAdminKey(req: Request): string | null {
  const h = req.headers.get("x-admin-key");
  if (h) return h;
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // Lecture des paramètres : POST (body JSON) prioritaire, sinon query string (GET)
    let providedKey: string | null = null;
    let daysRaw: string | number | null = null;
    let userId: string | null = null;
    let detailsRaw: string | boolean | null = null;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        providedKey = body?.key ?? null;
        daysRaw = body?.days ?? body?.nb_days ?? null;
        userId = body?.user_id ?? null;
        detailsRaw = body?.details ?? null;
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    // Fallback query string (utile pour GET ou si le body est vide)
    providedKey = providedKey ?? url.searchParams.get("key");
    daysRaw = daysRaw ?? url.searchParams.get("days") ?? url.searchParams.get("nb_days");
    userId = userId ?? url.searchParams.get("user_id");
    detailsRaw = detailsRaw ?? url.searchParams.get("details");

    const expectedKey = Deno.env.get("CLAUDE_ACCESS_KEY");
    if (!expectedKey || providedKey !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const days = Math.min(parseInt(String(daysRaw ?? "90"), 10) || 90, 365);
    const includeDetails = detailsRaw === false || detailsRaw === "false" ? false : true;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const columns = includeDetails
      ? "id, user_id, strava_id, name, sport_type_raw, sport_type_normalized, start_date, timezone, duration_seconds, moving_time_seconds, distance_meters, elevation_gain_meters, avg_heartrate, max_heartrate, avg_power, max_power, avg_speed, max_speed, calories, splits_metric, laps"
      : "id, user_id, strava_id, name, sport_type_raw, sport_type_normalized, start_date, duration_seconds, moving_time_seconds, distance_meters, elevation_gain_meters, avg_heartrate, max_heartrate, avg_power, avg_speed, calories";

    let query = supabase
      .from("imported_activities")
      .select(columns)
      .gte("start_date", sinceDate)
      .order("start_date", { ascending: false })
      .limit(500);

    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) throw error;

    const cacheBuster = url.searchParams.get("t");

    return new Response(
      JSON.stringify({
        success: true,
        period_days: days,
        count: data?.length ?? 0,
        server_time: new Date().toISOString(),
        cache_buster: cacheBuster,
        most_recent_start_date: data?.[0]?.start_date ?? null,
        activities: data ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("claude-activities-v2 error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erreur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
