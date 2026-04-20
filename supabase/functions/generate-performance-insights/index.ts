// Edge function: génère des insights IA sur les performances récentes (cache 7j côté client)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Récupération des données contextuelles
    const sinceDate = new Date(Date.now() - period_days * 86400_000).toISOString();
    const [activitiesRes, goalRes, trajectoryRes] = await Promise.all([
      supabase.from("imported_activities")
        .select("sport_type_normalized, start_date, duration_seconds, distance_meters, avg_heartrate, avg_power, avg_speed, elevation_gain_meters")
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY manquant");

    const systemPrompt = `Tu es un coach d'endurance pédagogue et prudent.
À partir des données fournies, tu produis des insights UTILES, EXPLICABLES, NON GÉNÉRIQUES.
Règles strictes :
- Aucune métrique inventée. Si une donnée n'est pas dans les inputs, ne l'utilise pas.
- Pas de FTP, VO2max, seuils ventilatoires si non fournis.
- Ton bienveillant, factuel, jamais alarmiste.
- Pas de redondance avec la trajectoire (qui évalue le réalisme global).
- Focus : ce qui progresse, ce qui stagne, ce qui soutient/fragilise l'objectif, ce à surveiller.
- Recommandations concrètes et actionnables (pas "fais plus de sport").`;

    const userPrompt = `Période analysée : ${period_days} jours (${activities.length} activités).
Objectif : ${goal ? `${goal.event_name || goal.goal_type} ${goal.format ?? ""} le ${goal.target_date ?? "?"}` : "non défini"}
Trajectoire actuelle : ${trajectory ? `${trajectory.trajectory_status} (${trajectory.realism_score_percent}%) — ${trajectory.summary_short ?? ""}` : "non calculée"}

Résumé charge & régularité :
${JSON.stringify(dataSummary, null, 2)}

Activités brutes (les plus récentes en premier) :
${JSON.stringify(activities.slice(0, 60), null, 2)}

Génère un objet JSON avec exactement :
- insights : 3 à 5 observations clés (ce qui progresse, soutient l'objectif)
- vigilance : 2 à 3 points à surveiller
- recommendations : 2 à 3 actions concrètes`;

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

    // Persist
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
