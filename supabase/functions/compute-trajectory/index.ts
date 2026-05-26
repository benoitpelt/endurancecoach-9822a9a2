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

function daysSincePlanStart(planStartDate: string | null): number | null {
  if (!planStartDate) return null;
  return Math.ceil((Date.now() - new Date(planStartDate).getTime()) / (1000 * 60 * 60 * 24));
}

function planMaturity(daysSinceStart: number | null): "too_early" | "early" | "established" {
  if (daysSinceStart == null || daysSinceStart < 10) return "too_early";
  if (daysSinceStart < 28) return "early";
  return "established";
}

// ── Multi-dimensional adherence computation ──

interface AdherenceResult {
  calendar: { rate: number; summary: string };
  content: { rate: number; summary: string };
  load: { rate: number; summary: string };
  keyWorkouts: { rate: number; summary: string };
  continuity: { rate: number; summary: string };
}

function computeAdherence(
  completedList: any[],
  eligiblePlanned: any[],
  allPlannedWorkouts: any[],
  analysisStart: Date,
): AdherenceResult {
  const todayStr = new Date().toISOString().slice(0, 10);
  const totalEligible = eligiblePlanned.length;
  const totalCompleted = completedList.length;

  // ── Calendar adherence: how many planned workouts have a matching completed workout? ──
  const matchedPlannedIds = new Set(completedList.map(c => c.planned_workout_id).filter(Boolean));
  const calendarMatched = eligiblePlanned.filter(w => matchedPlannedIds.has(w.id)).length;
  const calendarRate = totalEligible > 0 ? calendarMatched / totalEligible : 0.5;

  let calendarSummary: string;
  if (totalEligible === 0) calendarSummary = "Pas encore de séances planifiées dans la fenêtre.";
  else if (calendarRate >= 0.8) calendarSummary = "Le calendrier prévu est bien respecté.";
  else if (calendarRate >= 0.5) calendarSummary = "Le calendrier n'est pas strictement suivi, mais l'essentiel est fait.";
  else calendarSummary = "L'organisation diffère sensiblement du plan initial.";

  // ── Content adherence: conformity of matched workouts ──
  const matchedCompleted = completedList.filter(c => c.planned_workout_id);
  const conformCount = matchedCompleted.filter(c => 
    c.conformity_status === "conform" || c.conformity_status === "partial"
  ).length;
  const contentRate = matchedCompleted.length > 0 ? conformCount / matchedCompleted.length : 0.5;
  
  let contentSummary: string;
  if (matchedCompleted.length === 0) contentSummary = "Pas assez de séances appariées pour évaluer le contenu.";
  else if (contentRate >= 0.8) contentSummary = "Le contenu des séances est globalement conforme.";
  else if (contentRate >= 0.5) contentSummary = "Le contenu est partiellement conforme, avec quelques écarts.";
  else contentSummary = "Le contenu réalisé s'éloigne souvent de ce qui était prévu.";

  // ── Load adherence: total volume (duration) vs planned ──
  const completedMinutes = completedList.reduce((sum, c) => 
    sum + (c.moving_time_seconds ? c.moving_time_seconds / 60 : 0), 0);
  const plannedMinutes = eligiblePlanned.reduce((sum, w) => 
    sum + (w.duration_target_minutes || 0), 0);
  
  let loadRate: number;
  if (plannedMinutes === 0 && completedMinutes > 0) loadRate = 0.8;
  else if (plannedMinutes === 0) loadRate = 0.5;
  else loadRate = Math.min(1.2, completedMinutes / plannedMinutes);
  // Normalize: 0.7-1.3 is ideal
  const loadScore = loadRate >= 0.6 && loadRate <= 1.4 
    ? Math.min(1, 1 - Math.abs(1 - loadRate) * 0.5) 
    : Math.max(0.2, 1 - Math.abs(1 - loadRate));

  let loadSummary: string;
  if (plannedMinutes === 0) loadSummary = "Pas de volume de référence disponible.";
  else if (loadRate >= 0.8 && loadRate <= 1.2) loadSummary = "La charge récente est cohérente avec le plan.";
  else if (loadRate >= 0.6) loadSummary = "La charge récente soutient la progression, même si elle diffère du plan.";
  else if (loadRate > 1.2) loadSummary = "La charge récente dépasse le plan, attention à la récupération.";
  else loadSummary = "La charge récente est en dessous des attentes du plan.";

  // ── Key workouts adherence ──
  const keyPlanned = eligiblePlanned.filter(w => w.workout_priority === "key");
  const keyDone = keyPlanned.filter(w => matchedPlannedIds.has(w.id)).length;
  // Also count free workouts that could serve as key equivalents (same sport, decent duration)
  const freeWorkouts = completedList.filter(c => !c.planned_workout_id && c.matching_status !== "ignored");
  let keyEquivalents = 0;
  const unmatchedKeySports = keyPlanned
    .filter(w => !matchedPlannedIds.has(w.id))
    .map(w => w.sport_type);
  
  for (const sport of unmatchedKeySports) {
    const equivalent = freeWorkouts.find(f => 
      f.sport_type === sport && 
      f.moving_time_seconds && f.moving_time_seconds > 2400 // >40min
    );
    if (equivalent) {
      keyEquivalents++;
      // Remove from pool so we don't double-count
      freeWorkouts.splice(freeWorkouts.indexOf(equivalent), 1);
    }
  }

  const effectiveKeyDone = keyDone + keyEquivalents * 0.7; // equivalents count 70%
  const keyRate = keyPlanned.length > 0 ? effectiveKeyDone / keyPlanned.length : 0.5;

  let keySummary: string;
  if (keyPlanned.length === 0) keySummary = "Pas de séance clé dans la fenêtre d'analyse.";
  else if (keyRate >= 0.8) keySummary = "Les séances clés sont bien préservées.";
  else if (keyRate >= 0.5) keySummary = "Les séances clés restent encore à confirmer pleinement.";
  else if (keyEquivalents > 0) keySummary = "Des séances clés manquent, mais des équivalents utiles ont été réalisés.";
  else keySummary = "Plusieurs séances clés n'ont pas été retrouvées.";

  // ── Continuity: recent training regularity (last 10 days) ──
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const recentCompleted = completedList.filter(c => 
    c.start_date && new Date(c.start_date) >= tenDaysAgo
  );
  // Count unique training days in last 10 days
  const trainingDays = new Set(recentCompleted.map(c => 
    c.start_date ? new Date(c.start_date).toISOString().slice(0, 10) : null
  ).filter(Boolean));
  
  // Expect roughly 4-6 training days per 10 days for triathlon
  const continuityRate = Math.min(1, trainingDays.size / 4);

  let continuitySummary: string;
  if (trainingDays.size >= 5) continuitySummary = "Excellente régularité ces derniers jours.";
  else if (trainingDays.size >= 3) continuitySummary = "La dynamique récente reste cohérente.";
  else if (trainingDays.size >= 1) continuitySummary = "Quelques séances récentes, mais la régularité pourrait être améliorée.";
  else continuitySummary = "Peu ou pas d'activité ces derniers jours.";

  return {
    calendar: { rate: calendarRate, summary: calendarSummary },
    content: { rate: contentRate, summary: contentSummary },
    load: { rate: loadScore, summary: loadSummary },
    keyWorkouts: { rate: Math.min(1, keyRate), summary: keySummary },
    continuity: { rate: continuityRate, summary: continuitySummary },
  };
}

function computeFallbackTrajectory(
  completedList: any[],
  eligiblePlanned: any[],
  allPlannedWorkouts: any[],
  analysisStart: Date,
  daysRemaining: number | null,
  maturity: "too_early" | "early" | "established",
) {
  const totalCompleted = completedList.length;
  const totalEligible = eligiblePlanned.length;

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
      adherence_dimensions: null,
    };
  }

  // Multi-dimensional analysis
  const adh = computeAdherence(completedList, eligiblePlanned, allPlannedWorkouts, analysisStart);

  // Weighted score — calendar is NOT dominant
  const weights = {
    calendar: 0.15,
    content: 0.20,
    load: 0.25,
    keyWorkouts: 0.25,
    continuity: 0.15,
  };

  const rawScore = Math.round(
    (adh.calendar.rate * weights.calendar +
     adh.content.rate * weights.content +
     adh.load.rate * weights.load +
     adh.keyWorkouts.rate * weights.keyWorkouts +
     adh.continuity.rate * weights.continuity) * 100
  );

  // Gentle clamping based on maturity
  const minScore = maturity === "early" ? 40 : 25;
  const maxScore = maturity === "early" ? 80 : 90;
  const score = Math.max(minScore, Math.min(maxScore, rawScore));

  let status = "watch";
  if (score >= 70) status = "on_track";
  else if (score >= 55) status = "watch";
  else if (score < 40 && maturity === "established") status = "fragile";
  else if (score < 50) status = "ambitious";

  const supporting: string[] = [];
  const weakening: string[] = [];

  if (adh.continuity.rate >= 0.7) supporting.push(adh.continuity.summary);
  if (adh.load.rate >= 0.6) supporting.push(adh.load.summary);
  if (adh.keyWorkouts.rate >= 0.7) supporting.push(adh.keyWorkouts.summary);
  if (adh.content.rate >= 0.7) supporting.push(adh.content.summary);
  if (totalCompleted > 0) supporting.push(`${totalCompleted} séance(s) réalisée(s) sur la période.`);

  if (adh.calendar.rate < 0.5 && totalEligible >= 3) weakening.push(adh.calendar.summary);
  if (adh.keyWorkouts.rate < 0.5 && eligiblePlanned.filter(w => w.workout_priority === "key").length >= 2) weakening.push(adh.keyWorkouts.summary);
  if (adh.load.rate < 0.5) weakening.push(adh.load.summary);
  if (adh.continuity.rate < 0.4) weakening.push(adh.continuity.summary);

  // Build short summary — non-punitive
  let summaryShort: string;
  if (maturity === "early") {
    summaryShort = "Le plan est encore récent, cette évaluation est préliminaire.";
  } else if (score >= 70) {
    summaryShort = "Ta préparation avance bien, continue sur cette lancée.";
  } else if (adh.continuity.rate >= 0.6 && adh.load.rate >= 0.5) {
    summaryShort = "La dynamique récente reste cohérente, même si l'organisation diffère du plan initial.";
  } else {
    summaryShort = "Ta trajectoire mérite attention, mais rien d'irréversible.";
  }

  let summaryDetailed = maturity === "early"
    ? "Tu démarres ton plan. L'évaluation sera plus fiable dans quelques semaines. Pour l'instant, l'important est de maintenir la régularité."
    : `${adh.calendar.summary} ${adh.load.summary} ${adh.keyWorkouts.summary} ${adh.continuity.summary}`;

  return {
    trajectory_status: status,
    realism_score_percent: score,
    summary_short: summaryShort,
    summary_detailed: summaryDetailed,
    supporting_points: supporting.slice(0, 5),
    weakening_points: weakening.slice(0, 4),
    discipline_breakdown: {},
    suggests_plan_review: maturity === "established" && score < 40,
    adherence_dimensions: {
      calendar: { rate: Math.round(adh.calendar.rate * 100), summary: adh.calendar.summary },
      load: { rate: Math.round(adh.load.rate * 100), summary: adh.load.summary },
      key_workouts: { rate: Math.round(adh.keyWorkouts.rate * 100), summary: adh.keyWorkouts.summary },
      continuity: { rate: Math.round(adh.continuity.rate * 100), summary: adh.continuity.summary },
      content: { rate: Math.round(adh.content.rate * 100), summary: adh.content.summary },
    },
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

    // Parse optional body (for service-role internal invocations)
    let bodyUserId: string | null = null;
    let bodyTrigger: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        bodyUserId = body?.user_id ?? null;
        bodyTrigger = body?.trigger_event ?? null;
      } catch { /* no body */ }
    }

    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;

    // Internal service-role invocation: trust user_id from body
    if (bodyUserId && token === supabaseKey) {
      userId = bodyUserId;
    } else {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user }, error: authErr } = await anonClient.auth.getUser(token);
      if (authErr || !user) return jsonResponse({ error: "Session invalide" }, 401);
      userId = user.id;
    }
    const triggerEvent = bodyTrigger || "manual_compute";
    console.log("[compute-trajectory] userId:", userId, "trigger:", triggerEvent);

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
          adherence_dimensions: null,
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

    // ── Bound analysis window by plan start date ──
    const now = new Date();
    const sixWeeksAgo = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000);
    const planStartDate = plan?.start_date ? new Date(plan.start_date) : null;
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

    // Load planned workouts
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

        const todayStr = now.toISOString().slice(0, 10);
        const analysisStartStr = analysisStart.toISOString().slice(0, 10);
        eligiblePlanned = allPlannedWorkouts.filter((w: any) => {
          if (!w.scheduled_date) return false;
          return w.scheduled_date >= analysisStartStr && w.scheduled_date <= todayStr;
        });
      }
    }

    // Load analyses
    const { data: analyses } = await supabase
      .from("workout_analyses")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", analysisStartISO)
      .order("created_at", { ascending: false })
      .limit(20);

    // Load adjustments
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

    // Multi-dimensional adherence
    const adherence = computeAdherence(completedList, eligiblePlanned, allPlannedWorkouts, analysisStart);
    
    const recentAdjustmentsCount = (adjustments || []).length;

    console.log("[compute-trajectory] stats:", {
      totalCompleted,
      totalEligible,
      adherence: {
        calendar: Math.round(adherence.calendar.rate * 100),
        content: Math.round(adherence.content.rate * 100),
        load: Math.round(adherence.load.rate * 100),
        keyWorkouts: Math.round(adherence.keyWorkouts.rate * 100),
        continuity: Math.round(adherence.continuity.rate * 100),
      },
      maturity,
    });

    // Try AI, with fallback
    let trajectory: any;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      console.warn("[compute-trajectory] LOVABLE_API_KEY missing, using fallback");
      trajectory = computeFallbackTrajectory(completedList, eligiblePlanned, allPlannedWorkouts, analysisStart, daysRemaining, maturity);
    } else {
      // Build sport breakdown
      const matchedPlannedIds = new Set(completedList.map(c => c.planned_workout_id).filter(Boolean));
      const sportBreakdown: Record<string, { completed: number; planned: number }> = {};
      for (const w of eligiblePlanned) {
        if (!sportBreakdown[w.sport_type]) sportBreakdown[w.sport_type] = { completed: 0, planned: 0 };
        sportBreakdown[w.sport_type].planned++;
        if (matchedPlannedIds.has(w.id)) sportBreakdown[w.sport_type].completed++;
      }
      for (const c of completedList) {
        if (!sportBreakdown[c.sport_type]) sportBreakdown[c.sport_type] = { completed: 0, planned: 0 };
        if (!c.planned_workout_id) sportBreakdown[c.sport_type].completed++;
      }

      const futurePlanned = allPlannedWorkouts.filter((w: any) => w.scheduled_date && w.scheduled_date > now.toISOString().slice(0, 10));

      const maturityNote = maturity === "too_early"
        ? "ATTENTION : Le plan est très récent (moins de 10 jours). Sois très prudent. Ne tire aucune conclusion négative forte."
        : maturity === "early"
          ? "ATTENTION : Le plan est encore jeune (moins de 4 semaines). Reste prudent et modéré. Valorise les séances déjà réalisées."
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

ADHÉRENCE MULTI-DIMENSIONNELLE (pré-calculée):
- Calendrier: ${Math.round(adherence.calendar.rate * 100)}% — ${adherence.calendar.summary}
- Contenu: ${Math.round(adherence.content.rate * 100)}% — ${adherence.content.summary}
- Charge globale: ${Math.round(adherence.load.rate * 100)}% — ${adherence.load.summary}
- Séances clés: ${Math.round(adherence.keyWorkouts.rate * 100)}% — ${adherence.keyWorkouts.summary}
- Continuité récente: ${Math.round(adherence.continuity.rate * 100)}% — ${adherence.continuity.summary}

RÉPARTITION PAR SPORT:
${JSON.stringify(sportBreakdown)}

AJUSTEMENTS RÉCENTS: ${recentAdjustmentsCount}

PRINCIPES OBLIGATOIRES:
1. Ne JAMAIS conclure négativement uniquement parce que le calendrier exact n'est pas respecté.
2. Si la charge récente est bonne ET la continuité est bonne, la trajectoire doit être soutenue même avec un calendrier imparfait.
3. Une séance faite un jour différent du prévu mais dans la même semaine est un écart mineur.
4. Une séance libre utile (même sport, volume correct) compense partiellement une séance planifiée non retrouvée.
5. Ne JAMAIS écrire "très faible nombre de séances" ou "aucun entraînement prévu n'a été fait" si l'athlète s'entraîne activement.
6. Les formulations doivent être bienveillantes, contextualisées et non punitives.
7. Le statut "fragile" ne doit être utilisé que si PLUSIEURS dimensions convergent négativement ET le plan est établi (>4 semaines).

Produis un JSON avec exactement cette structure:
{
  "trajectory_status": "on_track" | "watch" | "ambitious" | "fragile",
  "realism_score_percent": nombre entre 0 et 100,
  "summary_short": "phrase courte bienveillante (max 2 lignes)",
  "summary_detailed": "paragraphe prudent et explicatif",
  "supporting_points": ["max 4 points"],
  "weakening_points": ["max 3 points"],
  "discipline_breakdown": {
    "sport_type": { "status": "on_track|watch|ambitious|fragile", "note": "courte explication" }
  },
  "suggests_plan_review": boolean,
  "adherence_dimensions": {
    "calendar": { "rate": nombre 0-100, "summary": "texte" },
    "load": { "rate": nombre 0-100, "summary": "texte" },
    "key_workouts": { "rate": nombre 0-100, "summary": "texte" },
    "continuity": { "rate": nombre 0-100, "summary": "texte" },
    "content": { "rate": nombre 0-100, "summary": "texte" }
  }
}

Réponds UNIQUEMENT avec le JSON, sans markdown ni commentaire.`;

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
          trajectory = computeFallbackTrajectory(completedList, eligiblePlanned, allPlannedWorkouts, analysisStart, daysRemaining, maturity);
        } else {
          const aiData = await aiRes.json();
          let content = aiData.choices?.[0]?.message?.content || "";
          content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

          try {
            trajectory = JSON.parse(content);
            // Ensure adherence_dimensions exist even from AI
            if (!trajectory.adherence_dimensions) {
              trajectory.adherence_dimensions = {
                calendar: { rate: Math.round(adherence.calendar.rate * 100), summary: adherence.calendar.summary },
                load: { rate: Math.round(adherence.load.rate * 100), summary: adherence.load.summary },
                key_workouts: { rate: Math.round(adherence.keyWorkouts.rate * 100), summary: adherence.keyWorkouts.summary },
                continuity: { rate: Math.round(adherence.continuity.rate * 100), summary: adherence.continuity.summary },
                content: { rate: Math.round(adherence.content.rate * 100), summary: adherence.content.summary },
              };
            }
          } catch {
            console.error("[compute-trajectory] Failed to parse AI JSON:", content.substring(0, 200));
            trajectory = computeFallbackTrajectory(completedList, eligiblePlanned, allPlannedWorkouts, analysisStart, daysRemaining, maturity);
          }
        }
      } catch (fetchErr) {
        console.error("[compute-trajectory] Fetch error:", fetchErr);
        trajectory = computeFallbackTrajectory(completedList, eligiblePlanned, allPlannedWorkouts, analysisStart, daysRemaining, maturity);
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

    // Save snapshot — store adherence dimensions in raw_input
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
        trigger_event: triggerEvent,
        raw_input: {
          analysis_start: analysisStart.toISOString().slice(0, 10),
          plan_start: plan?.start_date,
          days_since_plan_start: daysSinceStart,
          maturity,
          days_remaining: daysRemaining,
          total_completed: totalCompleted,
          eligible_planned: totalEligible,
          adherence_dimensions: trajectory.adherence_dimensions,
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
