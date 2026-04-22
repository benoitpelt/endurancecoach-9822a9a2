// Edge function: génère des insights IA sur les performances récentes (cache 7j côté client)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---- Helpers de formatage humain ----
function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m} min`;
}
function fmtRunPace(secPerKm: number): string {
  if (!secPerKm || !isFinite(secPerKm)) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}
function fmtSwimPace(secPer100m: number): string {
  if (!secPer100m || !isFinite(secPer100m)) return "—";
  const m = Math.floor(secPer100m / 60);
  const s = Math.round(secPer100m % 60);
  return `${m}:${String(s).padStart(2, "0")}/100m`;
}
function fmtBikeSpeed(mps: number): string {
  if (!mps || !isFinite(mps)) return "—";
  return `${(mps * 3.6).toFixed(1)} km/h`;
}
function fmtDistanceKm(m: number): string {
  if (!m) return "—";
  return `${(m / 1000).toFixed(1)} km`;
}

const isCycling = (s: string) => ["bike", "cycling", "ride", "virtualride", "ebikeride"].includes((s || "").toLowerCase());
const isRun = (s: string) => ["run", "running", "trailrun", "virtualrun"].includes((s || "").toLowerCase());
const isSwim = (s: string) => ["swim", "swimming"].includes((s || "").toLowerCase());

// Lundi de la semaine d'une date donnée
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Utilisateur invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const { period_days = 90, dataSummary } = await req.json();

    const sinceDate = new Date(Date.now() - period_days * 86400_000).toISOString();
    const [activitiesRes, goalRes, trajectoryRes] = await Promise.all([
      supabase.from("imported_activities")
        .select("sport_type_normalized, start_date, duration_seconds, moving_time_seconds, distance_meters, avg_heartrate, avg_power, avg_speed, elevation_gain_meters, name")
        .eq("user_id", userId)
        .gte("start_date", sinceDate)
        .order("start_date", { ascending: false })
        .limit(200),
      supabase.from("race_goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("goal_trajectory_snapshots").select("trajectory_status, realism_score_percent, summary_short").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const activities = activitiesRes.data ?? [];
    if (activities.length < 3) {
      return new Response(JSON.stringify({
        error: "insufficient_data",
        message: "Pas assez d'activités sur la période pour générer des insights fiables.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const goal = goalRes.data;
    const trajectory = trajectoryRes.data;

    // ---- Pré-formatage des activités en données lisibles par l'IA ----
    const formattedActivities = activities.map((a: any) => {
      const sport = a.sport_type_normalized || "other";
      const dur = a.moving_time_seconds || a.duration_seconds || 0;
      const dist = a.distance_meters || 0;
      const base: any = {
        date: a.start_date?.slice(0, 10),
        sport,
        nom: a.name || null,
        duree: fmtDuration(dur),
        distance: fmtDistanceKm(dist),
        denivele_m: a.elevation_gain_meters || null,
        fc_moy: a.avg_heartrate || null,
      };
      if (isRun(sport) && dist > 0 && dur > 0) {
        base.allure = fmtRunPace(dur / (dist / 1000));
      } else if (isSwim(sport) && dist > 0 && dur > 0) {
        base.allure = fmtSwimPace(dur / (dist / 100));
      } else if (isCycling(sport)) {
        if (a.avg_speed) base.vitesse = fmtBikeSpeed(a.avg_speed);
        if (a.avg_power) base.puissance_moy_w = Math.round(a.avg_power);
      }
      return base;
    });

    // ---- Agrégat hebdo lundi-dimanche, marquage de la semaine en cours ----
    const weeksMap = new Map<string, { sessions: number; sec: number; sports: Record<string, number> }>();
    for (const a of activities) {
      if (!a.start_date) continue;
      const ws = startOfWeek(new Date(a.start_date)).toISOString().slice(0, 10);
      const cur = weeksMap.get(ws) || { sessions: 0, sec: 0, sports: {} };
      cur.sessions += 1;
      const dur = a.moving_time_seconds || a.duration_seconds || 0;
      cur.sec += dur;
      const sport = a.sport_type_normalized || "other";
      cur.sports[sport] = (cur.sports[sport] || 0) + dur;
      weeksMap.set(ws, cur);
    }
    const currentWeekStart = startOfWeek(new Date()).toISOString().slice(0, 10);
    const weeklyFormatted = Array.from(weeksMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-12)
      .map(([weekStart, v]) => ({
        semaine_du: weekStart,
        seances: v.sessions,
        duree_totale: fmtDuration(v.sec),
        en_cours: weekStart === currentWeekStart,
      }));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY manquant");

    const systemPrompt = `Tu es un coach d'endurance pédagogue et prudent.
À partir des données fournies, tu produis des insights UTILES, EXPLICABLES, NON GÉNÉRIQUES.

RÈGLES ABSOLUES DE FORMAT (obligatoires) :
- Durées : TOUJOURS en heures/minutes (ex: "1h25", "45 min"). JAMAIS en secondes.
- Distances : TOUJOURS en kilomètres (ex: "80 km") ou en mètres pour la natation (ex: "1500 m"). JAMAIS en mètres pour le vélo/CAP.
- Allure course à pied : format min:sec/km (ex: "5:12/km"). JAMAIS en m/s.
- Allure natation : TOUJOURS au 100m, format min:sec/100m (ex: "1:45/100m"). JAMAIS en m/s, jamais au km.
- Vitesse vélo : km/h (ex: "32.5 km/h"). JAMAIS en m/s.
- Puissance vélo : watts (ex: "245 W").

RÈGLES ANALYSE :
- Aucune métrique inventée. Si une donnée n'est pas dans les inputs, ne l'utilise pas.
- Pas de FTP, VO2max, seuils ventilatoires si non fournis.
- Ton bienveillant, factuel, jamais alarmiste.
- Pas de redondance avec la trajectoire (qui évalue le réalisme global).
- Focus : ce qui progresse, ce qui stagne, ce qui soutient/fragilise l'objectif, ce à surveiller.
- Recommandations concrètes et actionnables (pas "fais plus de sport").

RÈGLE TEMPORELLE CRITIQUE :
- La semaine marquée "en_cours: true" est INCOMPLÈTE (on est en cours de semaine).
- N'utilise JAMAIS la semaine en cours pour conclure à une "baisse", "diminution", "stagnation" ou comparaison de volume.
- Pour les tendances hebdomadaires, compare uniquement des semaines COMPLÈTES (en_cours: false).
- Tu peux mentionner la semaine en cours uniquement comme "en cours, à confirmer".`;

    const userPrompt = `Période analysée : ${period_days} jours (${activities.length} activités).
Date de référence (aujourd'hui) : ${new Date().toISOString().slice(0, 10)}
Objectif : ${goal ? `${goal.event_name || goal.goal_type} ${goal.format ?? ""} le ${goal.target_date ?? "?"}` : "non défini"}
Trajectoire actuelle : ${trajectory ? `${trajectory.trajectory_status} (${trajectory.realism_score_percent}%) — ${trajectory.summary_short ?? ""}` : "non calculée"}

Résumé charge & régularité (calculé côté client) :
${JSON.stringify(dataSummary, null, 2)}

Volume hebdomadaire (lundi-dimanche, 12 dernières semaines max) :
${JSON.stringify(weeklyFormatted, null, 2)}

Activités récentes pré-formatées (durées en h/min, distances en km, allures déjà formatées) :
${JSON.stringify(formattedActivities.slice(0, 60), null, 2)}

Génère un objet JSON avec exactement :
- insights : 3 à 5 observations clés (ce qui progresse, soutient l'objectif)
- vigilance : 2 à 3 points à surveiller
- recommendations : 2 à 3 actions concrètes

Rappel : utilise UNIQUEMENT les formats humains (h/min, km, min:sec/km, min:sec/100m, km/h, W). Ne mentionne JAMAIS de secondes brutes ou de m/s dans les textes.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        tools: [{
          type: "function",
          function: {
            name: "produce_performance_insights",
            description: "Produit les insights de performance",
            parameters: {
              type: "object",
              properties: {
                insights: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } }, required: ["title", "detail"] } },
                vigilance: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } }, required: ["title", "detail"] } },
                recommendations: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" } }, required: ["title", "detail"] } },
              },
              required: ["insights", "vigilance", "recommendations"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "produce_performance_insights" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Trop de requêtes, réessaie dans un moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "Crédits IA épuisés. Recharge ton workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiRes.text();
      console.error("AI error", aiRes.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("Pas de tool call retourné");
    const parsed = JSON.parse(toolCall.function.arguments);

    const { error: insertErr } = await supabase.from("performance_insights").insert({
      user_id: userId,
      period_days,
      insights: parsed.insights,
      vigilance: parsed.vigilance,
      recommendations: parsed.recommendations,
      data_summary: dataSummary ?? null,
    });
    if (insertErr) console.error("Insert error", insertErr);

    return new Response(JSON.stringify({ ...parsed, generated_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-performance-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
