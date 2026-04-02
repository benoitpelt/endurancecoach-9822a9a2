import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Fallback trajectory when AI is unavailable */
function computeFallbackTrajectory(
  totalCompleted: number,
  keyPlanned: number,
  keyCompleted: number,
  conformityStats: Record<string, number>,
  daysRemaining: number | null,
) {
  const hasEnoughData = totalCompleted >= 3;
  if (!hasEnoughData) {
    return {
      trajectory_status: "insufficient_data",
      realism_score_percent: null,
      summary_short: "Pas encore assez de données pour évaluer ta trajectoire.",
      summary_detailed: "Continue à suivre ton plan et reviens dans quelques séances pour obtenir une première évaluation.",
      supporting_points: [],
      weakening_points: [],
      discipline_breakdown: {},
      suggests_plan_review: false,
    };
  }

  const keyRate = keyPlanned > 0 ? keyCompleted / keyPlanned : 0.5;
  const conformTotal = Object.values(conformityStats).reduce((a, b) => a + b, 0);
  const conformOk = (conformityStats["conforme"] || 0) + (conformityStats["acceptable"] || 0);
  const conformRate = conformTotal > 0 ? conformOk / conformTotal : 0.5;

  const rawScore = Math.round((keyRate * 0.5 + conformRate * 0.3 + 0.2) * 100);
  const score = Math.max(20, Math.min(85, rawScore));

  let status = "watch";
  if (score >= 70) status = "on_track";
  else if (score < 40) status = "fragile";

  const supporting: string[] = [];
  const weakening: string[] = [];

  if (keyRate >= 0.7) supporting.push("Bonne assiduité sur les séances clés");
  else if (keyRate < 0.5) weakening.push("Plusieurs séances clés manquées récemment");

  if (conformRate >= 0.6) supporting.push("Conformité globale satisfaisante");
  else weakening.push("Écarts fréquents par rapport au plan");

  if (totalCompleted >= 5) supporting.push(`${totalCompleted} séances réalisées récemment`);

  return {
    trajectory_status: status,
    realism_score_percent: score,
    summary_short: score >= 70
      ? "Ta préparation avance bien, continue sur cette lancée."
      : "Ta trajectoire mérite attention, mais rien d'irréversible.",
    summary_detailed: "Cette évaluation est basée sur ta régularité et le respect des séances clés. Elle sera affinée avec davantage de données.",
    supporting_points: supporting,
    weakening_points: weakening,
    discipline_breakdown: {},
    suggests_plan_review: score < 40,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Non authentifié" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return jsonResponse({ error: "Session invalide" }, 401);
    const userId = user.id;
    console.log("[compute-trajectory] userId:", userId);

    // Load goal
    const { data: goal } = await supabase
      .from("race_goals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log("[compute-trajectory] goal found:", !!goal);

    if (!goal) {
      return jsonResponse({
        trajectory: {
          trajectory_status: "insufficient_data",
          realism_score_percent: null,
          summary_short: "Aucun objectif défini. Définis un objectif pour suivre ta trajectoire.",
          summary_detailed: null,
          supporting_points: [],
          weakening_points: [],
          discipline_breakdown: {},
          suggests_plan_review: false,
        },
        snapshot_id: null,
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

    console.log("[compute-trajectory] plan found:", !!plan, plan?.status);

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

    // Compute stats
    const now = new Date();
    const targetDate = goal.target_date ? new Date(goal.target_date) : null;
    const daysRemaining = targetDate ? Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

    const completedList = completedWorkouts || [];
    const totalCompleted = completedList.length;
    const totalPlanned = plannedWorkouts.length;
    const pastPlanned = plannedWorkouts.filter((w: any) => w.scheduled_date && new Date(w.scheduled_date) <= now);
    const keyWorkoutsPlanned = pastPlanned.filter((w: any) => w.workout_priority === "key");
    const completedIds = new Set(completedList.map((c: any) => c.planned_workout_id).filter(Boolean));
    const keyWorkoutsCompleted = keyWorkoutsPlanned.filter((w: any) => completedIds.has(w.id));

    const conformityStats: Record<string, number> = {};
    for (const a of (analyses || [])) {
      const s = a.conformity_status || "pending";
      conformityStats[s] = (conformityStats[s] || 0) + 1;
    }

    const recentAdjustmentsCount = (adjustments || []).length;

    console.log("[compute-trajectory] stats:", {
      totalCompleted,
      totalPlanned,
      keyPlanned: keyWorkoutsPlanned.length,
      keyCompleted: keyWorkoutsCompleted.length,
      conformity: conformityStats,
      adjustments: recentAdjustmentsCount,
      daysRemaining,
    });

    // Try AI, with fallback
    let trajectory: any;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      console.warn("[compute-trajectory] LOVABLE_API_KEY missing, using fallback");
      trajectory = computeFallbackTrajectory(totalCompleted, keyWorkoutsPlanned.length, keyWorkoutsCompleted.length, conformityStats, daysRemaining);
    } else {
      // Build sport breakdown for prompt
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

      const futurePlanned = plannedWorkouts.filter((w: any) => w.scheduled_date && new Date(w.scheduled_date) > now);

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

      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
          console.error("[compute-trajectory] AI gateway error:", aiRes.status, errText);
          console.warn("[compute-trajectory] Falling back to rule-based computation");
          trajectory = computeFallbackTrajectory(totalCompleted, keyWorkoutsPlanned.length, keyWorkoutsCompleted.length, conformityStats, daysRemaining);
        } else {
          const aiData = await aiRes.json();
          let content = aiData.choices?.[0]?.message?.content || "";
          content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

          try {
            trajectory = JSON.parse(content);
          } catch {
            console.error("[compute-trajectory] Failed to parse AI JSON:", content.substring(0, 200));
            trajectory = computeFallbackTrajectory(totalCompleted, keyWorkoutsPlanned.length, keyWorkoutsCompleted.length, conformityStats, daysRemaining);
          }
        }
      } catch (fetchErr) {
        console.error("[compute-trajectory] Fetch error:", fetchErr);
        trajectory = computeFallbackTrajectory(totalCompleted, keyWorkoutsPlanned.length, keyWorkoutsCompleted.length, conformityStats, daysRemaining);
      }
    }

    // Clamp score if present
    if (trajectory.realism_score_percent != null) {
      trajectory.realism_score_percent = Math.max(0, Math.min(100, trajectory.realism_score_percent));
    }

    // Don't save snapshot for insufficient_data without a score
    if (trajectory.trajectory_status === "insufficient_data" && trajectory.realism_score_percent == null) {
      console.log("[compute-trajectory] Returning insufficient_data without snapshot");
      return jsonResponse({ trajectory, snapshot_id: null });
    }

    // Save snapshot
    const { data: snapshot, error: insertErr } = await supabase
      .from("goal_trajectory_snapshots")
      .insert({
        user_id: userId,
        goal_id: goal.id,
        plan_id: plan?.id || null,
        trajectory_status: trajectory.trajectory_status || "watch",
        realism_score_percent: trajectory.realism_score_percent ?? 50,
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
      console.error("[compute-trajectory] Insert error:", insertErr);
      // Still return the trajectory even if snapshot save fails
      return jsonResponse({ trajectory, snapshot_id: null });
    }

    console.log("[compute-trajectory] Snapshot saved:", snapshot.id);
    return jsonResponse({ trajectory, snapshot_id: snapshot.id });
  } catch (e: any) {
    console.error("[compute-trajectory] Unexpected error:", e);
    return jsonResponse({ error: e.message || "Erreur interne" }, 500);
  }
});
