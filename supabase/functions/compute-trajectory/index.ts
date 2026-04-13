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

/** Compute how many days since plan started */
function daysSincePlanStart(planStartDate: string | null): number | null {
  if (!planStartDate) return null;
  return Math.ceil((Date.now() - new Date(planStartDate).getTime()) / (1000 * 60 * 60 * 24));
}

/** Determine plan maturity label */
function planMaturity(daysSinceStart: number | null): "too_early" | "early" | "established" {
  if (daysSinceStart == null || daysSinceStart < 10) return "too_early";
  if (daysSinceStart < 28) return "early";
  return "established";
}

/** Fallback trajectory when AI is unavailable */
function computeFallbackTrajectory(
  totalCompleted: number,
  eligiblePlanned: number,
  keyPlanned: number,
  keyCompleted: number,
  conformityStats: Record<string, number>,
  daysRemaining: number | null,
  maturity: "too_early" | "early" | "established",
) {
  // Plan too recent → don't conclude negatively
  if (maturity === "too_early" || (maturity === "early" && totalCompleted < 3)) {
    return {
      trajectory_status: "insufficient_data",
      realism_score_percent: null,
      summary_short: maturity === "too_early"
        ? "Ton plan vient de démarrer, il est trop tôt pour évaluer ta trajectoire."
        : "Encore peu de données disponibles. Continue à suivre ton plan pour obtenir une première évaluation.",
      summary_detailed: "Le plan est encore récent. L'évaluation deviendra plus fiable après quelques semaines d'entraînement régulier.",
      supporting_points: totalCompleted > 0 ? [`${totalCompleted} séance(s) déjà réalisée(s), c'est un bon début.`] : [],
      weakening_points: [],
      discipline_breakdown: {},
      suggests_plan_review: false,
    };
  }

  const completionRate = eligiblePlanned > 0 ? totalCompleted / eligiblePlanned : 0.5;
  const keyRate = keyPlanned > 0 ? keyCompleted / keyPlanned : 0.5;
  const conformTotal = Object.values(conformityStats).reduce((a, b) => a + b, 0);
  const conformOk = (conformityStats["conforme"] || 0) + (conformityStats["acceptable"] || 0);
  const conformRate = conformTotal > 0 ? conformOk / conformTotal : 0.5;

  // Weight completion and key rates more when established, be gentler when early
  const maturityFactor = maturity === "early" ? 0.15 : 0.2;
  const rawScore = Math.round((keyRate * 0.4 + conformRate * 0.25 + completionRate * maturityFactor + (1 - maturityFactor - 0.65) + 0.2) * 100);
  const score = Math.max(30, Math.min(85, rawScore));

  let status = "watch";
  if (score >= 70) status = "on_track";
  else if (score < 40 && maturity === "established") status = "fragile";

  const supporting: string[] = [];
  const weakening: string[] = [];

  if (totalCompleted > 0) supporting.push(`${totalCompleted} séance(s) réalisée(s) sur ${eligiblePlanned} éligible(s)`);
  if (keyRate >= 0.7) supporting.push("Bonne assiduité sur les séances clés");
  if (conformRate >= 0.6 && conformTotal >= 2) supporting.push("Conformité globale satisfaisante");

  if (maturity === "early") {
    if (keyPlanned > 0 && keyCompleted === 0) weakening.push("Aucune séance clé encore réalisée, mais le plan est récent");
    if (completionRate < 0.3 && eligiblePlanned >= 5) weakening.push("Taux de réalisation encore faible");
  } else {
    if (keyRate < 0.5 && keyPlanned >= 3) weakening.push("Plusieurs séances clés manquées");
    if (conformRate < 0.4 && conformTotal >= 3) weakening.push("Écarts fréquents par rapport au plan");
  }

  return {
    trajectory_status: status,
    realism_score_percent: score,
    summary_short: maturity === "early"
      ? "Le plan est encore récent, cette évaluation est préliminaire."
      : score >= 70
        ? "Ta préparation avance bien, continue sur cette lancée."
        : "Ta trajectoire mérite attention, mais rien d'irréversible.",
    summary_detailed: maturity === "early"
      ? "Tu démarres ton plan. L'évaluation sera plus fiable dans quelques semaines. Pour l'instant, l'important est de maintenir la régularité."
      : "Cette évaluation est basée sur ta régularité et le respect des séances clés. Elle sera affinée avec davantage de données.",
    supporting_points: supporting,
    weakening_points: weakening,
    discipline_breakdown: {},
    suggests_plan_review: maturity === "established" && score < 40,
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

    console.log("[compute-trajectory] plan found:", !!plan, plan?.status, "start_date:", plan?.start_date);

    // ── KEY FIX: Bound analysis window by plan start date ──
    const now = new Date();
    const sixWeeksAgo = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000);
    const planStartDate = plan?.start_date ? new Date(plan.start_date) : null;
    // analysis_start_date = max(plan_start_date, now - 42 days)
    const analysisStart = planStartDate && planStartDate > sixWeeksAgo ? planStartDate : sixWeeksAgo;
    const analysisStartISO = analysisStart.toISOString();

    const daysSinceStart = daysSincePlanStart(plan?.start_date);
    const maturity = planMaturity(daysSinceStart);
    console.log("[compute-trajectory] analysisStart:", analysisStartISO, "daysSinceStart:", daysSinceStart, "maturity:", maturity);

    // Load completed workouts within analysis window
    const { data: completedWorkouts } = await supabase
      .from("completed_workouts")
      .select("*")
      .eq("user_id", userId)
      .gte("start_date", analysisStartISO)
      .order("start_date", { ascending: false });

    // Load planned workouts — only past/today within analysis window
    let eligiblePlanned: any[] = [];
    let allPlannedWorkouts: any[] = [];
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
        allPlannedWorkouts = pw || [];

        // Only count workouts scheduled from analysis start to today (inclusive)
        const todayStr = now.toISOString().slice(0, 10);
        const analysisStartStr = analysisStart.toISOString().slice(0, 10);
        eligiblePlanned = allPlannedWorkouts.filter((w: any) => {
          if (!w.scheduled_date) return false;
          return w.scheduled_date >= analysisStartStr && w.scheduled_date <= todayStr;
        });
      }
    }

    // Load recent analyses within analysis window
    const { data: analyses } = await supabase
      .from("workout_analyses")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", analysisStartISO)
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
    const targetDate = goal.target_date ? new Date(goal.target_date) : null;
    const daysRemaining = targetDate ? Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

    const completedList = completedWorkouts || [];
    const totalCompleted = completedList.length;
    const totalEligible = eligiblePlanned.length;
    const keyWorkoutsPlanned = eligiblePlanned.filter((w: any) => w.workout_priority === "key");
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
      totalEligible,
      keyPlanned: keyWorkoutsPlanned.length,
      keyCompleted: keyWorkoutsCompleted.length,
      conformity: conformityStats,
      adjustments: recentAdjustmentsCount,
      daysRemaining,
      maturity,
    });

    // Try AI, with fallback
    let trajectory: any;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      console.warn("[compute-trajectory] LOVABLE_API_KEY missing, using fallback");
      trajectory = computeFallbackTrajectory(totalCompleted, totalEligible, keyWorkoutsPlanned.length, keyWorkoutsCompleted.length, conformityStats, daysRemaining, maturity);
    } else {
      // Build sport breakdown for prompt
      const sportBreakdown: Record<string, { completed: number; planned: number }> = {};
      for (const w of eligiblePlanned) {
        if (!sportBreakdown[w.sport_type]) sportBreakdown[w.sport_type] = { completed: 0, planned: 0 };
        sportBreakdown[w.sport_type].planned++;
        if (completedIds.has(w.id)) sportBreakdown[w.sport_type].completed++;
      }
      for (const c of completedList) {
        if (!sportBreakdown[c.sport_type]) sportBreakdown[c.sport_type] = { completed: 0, planned: 0 };
        if (!c.planned_workout_id) sportBreakdown[c.sport_type].completed++;
      }

      const futurePlanned = allPlannedWorkouts.filter((w: any) => w.scheduled_date && w.scheduled_date > now.toISOString().slice(0, 10));

      const maturityNote = maturity === "too_early"
        ? "ATTENTION : Le plan est très récent (moins de 10 jours). Sois très prudent dans tes conclusions. Ne tire aucune conclusion négative forte."
        : maturity === "early"
          ? "ATTENTION : Le plan est encore jeune (moins de 4 semaines). Reste prudent et modéré dans tes conclusions. Valorise les séances déjà réalisées."
          : "Le plan a plus de 4 semaines de recul, tu peux tirer des conclusions plus affirmées.";

      const prompt = `Tu es un coach d'endurance expert et bienveillant. Analyse la trajectoire de cet athlète vers son objectif.

CONTEXTE TEMPOREL CRITIQUE:
${maturityNote}
- Le plan a démarré il y a ${daysSinceStart ?? "?"} jours (date de début : ${plan?.start_date || "inconnue"}).
- Fenêtre d'analyse : du ${analysisStart.toISOString().slice(0, 10)} à aujourd'hui.
- Seules les séances planifiées dans cette fenêtre comptent dans le dénominateur.

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
- Séances éligibles à date: ${totalEligible}
- Séances futures restantes: ${futurePlanned.length}

RÉALISÉ (fenêtre d'analyse):
- Séances complétées: ${totalCompleted}
- Séances clés éligibles: ${keyWorkoutsPlanned.length}
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
- Le dénominateur est ${totalEligible} séances éligibles, PAS le total du plan
- Si le plan est récent (<4 semaines), ne conclus pas négativement même si le taux de réalisation semble faible
- Valorise les séances déjà réalisées, même peu nombreuses
- Ne dis jamais "3 sur 59" car 59 inclut les séances futures non encore éligibles
- Une mauvaise semaine isolée ne casse pas tout
- Les séances clés pèsent plus que les optionnelles
- Si peu de données ou plan récent, reste prudent (score autour de 50-65, statut "watch")
- Le statut "fragile" ne doit être utilisé que si le plan est établi ET que plusieurs signaux convergent
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
          trajectory = computeFallbackTrajectory(totalCompleted, totalEligible, keyWorkoutsPlanned.length, keyWorkoutsCompleted.length, conformityStats, daysRemaining, maturity);
        } else {
          const aiData = await aiRes.json();
          let content = aiData.choices?.[0]?.message?.content || "";
          content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

          try {
            trajectory = JSON.parse(content);
          } catch {
            console.error("[compute-trajectory] Failed to parse AI JSON:", content.substring(0, 200));
            trajectory = computeFallbackTrajectory(totalCompleted, totalEligible, keyWorkoutsPlanned.length, keyWorkoutsCompleted.length, conformityStats, daysRemaining, maturity);
          }
        }
      } catch (fetchErr) {
        console.error("[compute-trajectory] Fetch error:", fetchErr);
        trajectory = computeFallbackTrajectory(totalCompleted, totalEligible, keyWorkoutsPlanned.length, keyWorkoutsCompleted.length, conformityStats, daysRemaining, maturity);
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
          analysis_start: analysisStart.toISOString().slice(0, 10),
          plan_start: plan?.start_date,
          days_since_plan_start: daysSinceStart,
          maturity,
          days_remaining: daysRemaining,
          total_completed: totalCompleted,
          eligible_planned: totalEligible,
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
      return jsonResponse({ trajectory, snapshot_id: null });
    }

    console.log("[compute-trajectory] Snapshot saved:", snapshot.id);
    return jsonResponse({ trajectory, snapshot_id: snapshot.id });
  } catch (e: any) {
    console.error("[compute-trajectory] Unexpected error:", e);
    return jsonResponse({ error: e.message || "Erreur interne" }, 500);
  }
});
