import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Non authentifié");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new Error("Session invalide");
    const userId = user.id;

    // Load goal
    const { data: goal } = await supabase
      .from("race_goals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!goal) {
      return new Response(JSON.stringify({ error: "Aucun objectif défini." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load plan
    const { data: plan } = await supabase
      .from("training_plans")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["active", "draft"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Load recent completed workouts (last 6 weeks)
    const sixWeeksAgo = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString();
    const { data: completedWorkouts } = await supabase
      .from("completed_workouts")
      .select("*")
      .eq("user_id", userId)
      .gte("start_date", sixWeeksAgo)
      .order("start_date", { ascending: false });

    // Load planned workouts for context
    let plannedWorkouts: any[] = [];
    if (plan) {
      const { data: weeks } = await supabase
        .from("training_weeks")
        .select("id, block_id, week_number, start_date, end_date")
        .eq("user_id", userId)
        .order("week_number");

      if (weeks && weeks.length > 0) {
        const weekIds = weeks.map((w: any) => w.id);
        const { data: pw } = await supabase
          .from("planned_workouts")
          .select("*")
          .in("week_id", weekIds)
          .order("scheduled_date");
        plannedWorkouts = pw || [];
      }
    }

    // Load recent analyses
    const { data: analyses } = await supabase
      .from("workout_analyses")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Load recent adjustments
    const { data: adjustments } = await supabase
      .from("plan_adjustments")
      .select("*")
      .eq("user_id", userId)
      .order("applied_at", { ascending: false })
      .limit(10);

    // Build prompt for AI
    const now = new Date();
    const targetDate = goal.target_date ? new Date(goal.target_date) : null;
    const daysRemaining = targetDate ? Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

    const completedList = (completedWorkouts || []);
    const totalCompleted = completedList.length;
    const totalPlanned = plannedWorkouts.length;
    const futurePlanned = plannedWorkouts.filter((w: any) => w.scheduled_date && new Date(w.scheduled_date) > now);
    const pastPlanned = plannedWorkouts.filter((w: any) => w.scheduled_date && new Date(w.scheduled_date) <= now);
    const keyWorkoutsPlanned = pastPlanned.filter((w: any) => w.workout_priority === "key");
    const completedIds = new Set(completedList.map((c: any) => c.planned_workout_id).filter(Boolean));
    const keyWorkoutsCompleted = keyWorkoutsPlanned.filter((w: any) => completedIds.has(w.id));

    const sportBreakdown: Record<string, { completed: number; planned: number }> = {};
    for (const w of pastPlanned) {
      if (!sportBreakdown[w.sport_type]) sportBreakdown[w.sport_type] = { completed: 0, planned: 0 };
      sportBreakdown[w.sport_type].planned++;
      if (completedIds.has(w.id)) sportBreakdown[w.sport_type].completed++;
    }
    for (const c of completedList) {
      if (!sportBreakdown[c.sport_type]) sportBreakdown[c.sport_type] = { completed: 0, planned: 0 };
      if (!c.planned_workout_id) sportBreakdown[c.sport_type].completed++;
    }

    const conformityStats: Record<string, number> = {};
    for (const a of (analyses || [])) {
      const s = a.conformity_status || "pending";
      conformityStats[s] = (conformityStats[s] || 0) + 1;
    }

    const recentAdjustmentsCount = (adjustments || []).length;

    const prompt = `Tu es un coach d'endurance expert et bienveillant. Analyse la trajectoire de cet athlète vers son objectif.

OBJECTIF:
- Type: ${goal.goal_type}
- Format: ${goal.format || "non précisé"}
- Événement: ${goal.event_name || "non précisé"}
- Date cible: ${goal.target_date || "non précisée"}
- Jours restants: ${daysRemaining ?? "inconnu"}
- Objectif principal: ${goal.primary_objective || "non précisé"}
- Temps cible: ${goal.target_time || "non précisé"}

PLAN:
- Statut: ${plan?.status || "aucun plan"}
- Séances planifiées (total): ${totalPlanned}
- Séances futures: ${futurePlanned.length}
- Séances passées planifiées: ${pastPlanned.length}

RÉALISÉ (6 dernières semaines):
- Séances complétées: ${totalCompleted}
- Séances clés planifiées (passé): ${keyWorkoutsPlanned.length}
- Séances clés réalisées: ${keyWorkoutsCompleted.length}

CONFORMITÉ RÉCENTE:
${JSON.stringify(conformityStats)}

RÉPARTITION PAR SPORT:
${JSON.stringify(sportBreakdown)}

AJUSTEMENTS RÉCENTS: ${recentAdjustmentsCount}

Produis un JSON avec exactement cette structure:
{
  "trajectory_status": "on_track" | "watch" | "ambitious" | "fragile",
  "realism_score_percent": nombre entre 0 et 100,
  "summary_short": "phrase courte bienveillante",
  "summary_detailed": "paragraphe explicatif prudent",
  "supporting_points": ["point 1", "point 2", ...],
  "weakening_points": ["point 1", "point 2", ...],
  "discipline_breakdown": {
    "sport_type": { "status": "on_track|watch|ambitious|fragile", "note": "courte explication" }
  },
  "suggests_plan_review": boolean
}

Règles:
- Sois prudent et bienveillant, jamais brutal
- Le pourcentage ne doit jamais être présenté comme une vérité absolue
- Une mauvaise semaine isolée ne casse pas tout
- Les séances clés pèsent plus que les optionnelles
- Tiens compte des tendances, pas seulement du dernier événement
- Si peu de données, reste prudent (score autour de 50-60, statut "watch")
- Le statut "fragile" ne doit être utilisé que si plusieurs signaux convergent
- Réponds UNIQUEMENT avec le JSON, sans markdown ni commentaire`;

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("Clé API manquante");

    const aiRes = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", errText);
      throw new Error("Erreur lors du calcul de la trajectoire");
    }

    const aiData = await aiRes.json();
    let content = aiData.choices?.[0]?.message?.content || "";
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let trajectory: any;
    try {
      trajectory = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Réponse du coach mal formatée");
    }

    // Clamp score
    trajectory.realism_score_percent = Math.max(0, Math.min(100, trajectory.realism_score_percent || 50));

    // Save snapshot
    const { data: snapshot, error: insertErr } = await supabase
      .from("goal_trajectory_snapshots")
      .insert({
        user_id: userId,
        goal_id: goal.id,
        plan_id: plan?.id || null,
        trajectory_status: trajectory.trajectory_status || "watch",
        realism_score_percent: trajectory.realism_score_percent,
        summary_short: trajectory.summary_short,
        summary_detailed: trajectory.summary_detailed,
        supporting_points: trajectory.supporting_points || [],
        weakening_points: trajectory.weakening_points || [],
        discipline_breakdown: trajectory.discipline_breakdown || {},
        suggests_plan_review: trajectory.suggests_plan_review || false,
        trigger_event: "manual_compute",
        raw_input: {
          days_remaining: daysRemaining,
          total_completed: totalCompleted,
          key_completed: keyWorkoutsCompleted.length,
          key_planned: keyWorkoutsPlanned.length,
          conformity: conformityStats,
          adjustments_count: recentAdjustmentsCount,
        },
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Insert error:", insertErr);
      throw new Error("Impossible de sauvegarder le snapshot");
    }

    return new Response(JSON.stringify({ trajectory, snapshot_id: snapshot.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("compute-trajectory error:", e);
    return new Response(JSON.stringify({ error: e.message || "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
