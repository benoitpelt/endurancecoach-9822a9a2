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
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Non autorisé");

    const supabase = createClient(supabaseUrl, serviceKey);
    const userId = user.id;

    // Load plan, enriched profile, metrics, and future workouts
    const [planRes, enrichedRes, metricsRes, goalRes] = await Promise.all([
      supabase.from("training_plans").select("*").eq("user_id", userId).in("status", ["active", "draft"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("athlete_enriched_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("athlete_metric_history").select("*").eq("user_id", userId).order("observed_at", { ascending: false }).limit(20),
      supabase.from("race_goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const plan = planRes.data;
    if (!plan) throw new Error("Aucun plan actif trouvé.");

    const enriched = enrichedRes.data;
    const metrics = metricsRes.data || [];
    const goal = goalRes.data;

    // Get all blocks and weeks for this plan
    const { data: blocks } = await supabase
      .from("training_blocks")
      .select("*")
      .eq("plan_id", plan.id)
      .eq("user_id", userId)
      .order("block_order");

    if (!blocks || blocks.length === 0) throw new Error("Aucun bloc trouvé dans le plan.");

    const blockIds = blocks.map((b: any) => b.id);
    const { data: weeks } = await supabase
      .from("training_weeks")
      .select("*")
      .in("block_id", blockIds)
      .eq("user_id", userId)
      .order("week_number");

    if (!weeks || weeks.length === 0) throw new Error("Aucune semaine trouvée dans le plan.");

    const weekIds = weeks.map((w: any) => w.id);

    // Get all workouts
    const { data: allWorkouts } = await supabase
      .from("planned_workouts")
      .select("*")
      .in("week_id", weekIds)
      .eq("user_id", userId)
      .order("scheduled_date");

    if (!allWorkouts || allWorkouts.length === 0) throw new Error("Aucune séance trouvée.");

    // Split into past and future workouts
    const today = new Date().toISOString().split("T")[0];
    const futureWorkouts = allWorkouts.filter((w: any) => !w.scheduled_date || w.scheduled_date >= today);
    const pastWorkouts = allWorkouts.filter((w: any) => w.scheduled_date && w.scheduled_date < today);

    if (futureWorkouts.length === 0) throw new Error("Aucune séance future à recalibrer.");

    // Get recent completed workouts for calibration context
    const { data: recentCompleted } = await supabase
      .from("completed_workouts")
      .select("sport_type, duration_seconds, distance_meters, avg_heartrate, avg_power, avg_speed, start_date, conformity_status")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .limit(15);

    // Build prompt for recalibration (NOT full regeneration)
    const prompt = buildRecalibrationPrompt({
      plan,
      blocks,
      weeks,
      futureWorkouts,
      pastWorkouts,
      enriched,
      metrics,
      goal,
      recentCompleted: recentCompleted || [],
      today,
    });

    // Call AI
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Tu es un coach d'endurance expert. Tu recalibres des séances d'entraînement futures en te basant sur les données Strava importées. Tu ne changes PAS la structure du plan (blocs, semaines, périodisation). Tu ajustes UNIQUEMENT le contenu des séances futures : durées, distances, allures, zones, structure. Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 65536,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI recalibrate error:", errText);
      throw new Error("Erreur lors du recalibrage.");
    }

    const aiText = await aiRes.text();
    let aiData: any;
    try {
      aiData = JSON.parse(aiText);
    } catch {
      console.error("Failed to parse AI response:", aiText.substring(0, 300));
      throw new Error("Erreur de format de la réponse.");
    }

    let rawContent = aiData.choices?.[0]?.message?.content || "";
    rawContent = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    let recalibratedWorkouts: any[];
    try {
      recalibratedWorkouts = JSON.parse(rawContent);
    } catch {
      console.error("Failed to parse recalibrated workouts:", rawContent.substring(0, 500));
      throw new Error("Erreur de format dans les séances recalibrées.");
    }

    if (!Array.isArray(recalibratedWorkouts)) {
      throw new Error("Format invalide : un tableau de séances est attendu.");
    }

    // Apply recalibrated workouts: snapshot old versions, then update
    let updatedCount = 0;

    for (const recal of recalibratedWorkouts) {
      const workoutId = recal.id;
      if (!workoutId) continue;

      const existing = futureWorkouts.find((w: any) => w.id === workoutId);
      if (!existing) continue;

      // Snapshot the current version
      const { data: existingVersions } = await supabase
        .from("planned_workout_versions")
        .select("version_number")
        .eq("workout_id", workoutId)
        .order("version_number", { ascending: false })
        .limit(1);

      const nextVersion = (existingVersions?.[0]?.version_number || 0) + 1;

      await supabase.from("planned_workout_versions").insert({
        workout_id: workoutId,
        user_id: userId,
        version_number: nextVersion,
        snapshot: existing,
        change_reason: "recalibration_strava",
      });

      // Update the workout with recalibrated values (only fields that changed)
      const updateFields: Record<string, any> = {};
      const fieldsToUpdate = [
        "duration_target_minutes", "distance_target_km", "distance_target_meters",
        "target_summary_label", "primary_target_type", "primary_target_value_text",
        "secondary_target_value_text", "warmup_summary", "main_set_summary",
        "cooldown_summary", "workout_structure_json", "structure_text",
        "coach_note_short", "intensity_zone_label", "session_goal",
        "carb_strategy_type", "carb_before_g", "carb_during_g_per_hour",
        "carb_total_target_g", "hydration_note", "gut_training_priority",
      ];

      for (const field of fieldsToUpdate) {
        if (recal[field] !== undefined) {
          updateFields[field] = recal[field];
        }
      }

      // Preserve sport_type, scheduled_date, workout_priority, week_id
      // Only update content fields
      if (Object.keys(updateFields).length > 0) {
        updateFields.created_by_type = "ai_recalibration";
        const { error: updateErr } = await supabase
          .from("planned_workouts")
          .update(updateFields)
          .eq("id", workoutId)
          .eq("user_id", userId);

        if (updateErr) {
          console.error(`Update error for workout ${workoutId}:`, updateErr);
        } else {
          updatedCount++;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      recalibrated_count: updatedCount,
      total_future: futureWorkouts.length,
      message: `${updatedCount} séance(s) recalibrée(s) sur ${futureWorkouts.length} séances futures.`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("recalibrate-workouts error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erreur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildRecalibrationPrompt(ctx: any): string {
  const { plan, blocks, weeks, futureWorkouts, pastWorkouts, enriched, metrics, goal, recentCompleted, today } = ctx;

  let prompt = `CONTEXTE DE RECALIBRAGE (PAS de régénération complète)\n\n`;
  prompt += `Date du jour: ${today}\n`;
  prompt += `Plan: "${plan.name}" (${plan.start_date} → ${plan.end_date})\n\n`;

  if (goal) {
    prompt += `OBJECTIF:\n`;
    prompt += `- Type: ${goal.goal_type}\n`;
    if (goal.format) prompt += `- Format: ${goal.format}\n`;
    if (goal.target_date) prompt += `- Date cible: ${goal.target_date}\n`;
    if (goal.target_time) prompt += `- Temps visé: ${goal.target_time}\n\n`;
  }

  if (enriched) {
    prompt += `PROFIL ENRICHI (Strava):\n`;
    if (enriched.weekly_volume_hours) prompt += `- Volume hebdo: ${JSON.stringify(enriched.weekly_volume_hours)}\n`;
    if (enriched.sessions_per_week) prompt += `- Séances/semaine: ${enriched.sessions_per_week}\n`;
    if (enriched.strongest_discipline) prompt += `- Point fort: ${enriched.strongest_discipline}\n`;
    if (enriched.weakest_discipline) prompt += `- Point faible: ${enriched.weakest_discipline}\n`;
    if (enriched.longest_recent_run) prompt += `- Plus longue course: ${enriched.longest_recent_run}\n`;
    if (enriched.longest_recent_bike) prompt += `- Plus long vélo: ${enriched.longest_recent_bike}\n`;
    if (enriched.longest_recent_swim) prompt += `- Plus longue nage: ${enriched.longest_recent_swim}\n`;
    prompt += `\n`;
  }

  if (metrics.length > 0) {
    prompt += `MÉTRIQUES RÉCENTES:\n`;
    for (const m of metrics.slice(0, 10)) {
      prompt += `- ${m.metric_type}: ${m.metric_value} ${m.metric_unit || ""}\n`;
    }
    prompt += `\n`;
  }

  if (recentCompleted.length > 0) {
    prompt += `SÉANCES RÉCENTES RÉALISÉES:\n`;
    for (const rw of recentCompleted) {
      const dur = rw.duration_seconds ? `${Math.round(rw.duration_seconds / 60)}min` : "";
      const dist = rw.distance_meters ? `${(rw.distance_meters / 1000).toFixed(1)}km` : "";
      const hr = rw.avg_heartrate ? `FC ${Math.round(rw.avg_heartrate)}` : "";
      const pwr = rw.avg_power ? `${Math.round(rw.avg_power)}W` : "";
      prompt += `- ${rw.start_date?.split("T")[0] || "?"}: ${rw.sport_type} ${[dur, dist, hr, pwr].filter(Boolean).join(", ")}\n`;
    }
    prompt += `\n`;
  }

  prompt += `STRUCTURE DU PLAN (ne pas modifier):\n`;
  prompt += `Blocs: ${blocks.map((b: any) => `"${b.name}" (${b.start_date}→${b.end_date})`).join(", ")}\n`;
  prompt += `Semaines: ${weeks.length} semaines\n\n`;

  prompt += `SÉANCES FUTURES À RECALIBRER (${futureWorkouts.length} séances):\n`;
  for (const wo of futureWorkouts) {
    prompt += `- id: "${wo.id}", sport: ${wo.sport_type}, date: ${wo.scheduled_date}, priorité: ${wo.workout_priority}, durée: ${wo.duration_target_minutes}min`;
    if (wo.target_summary_label) prompt += `, cible: "${wo.target_summary_label}"`;
    if (wo.session_goal) prompt += `, objectif: "${wo.session_goal}"`;
    prompt += `\n`;
  }

  prompt += `\nRÈGLES IMPÉRATIVES:
1. NE PAS changer le sport_type, scheduled_date, workout_priority ni week_id.
2. Ajuster UNIQUEMENT le contenu : durées, distances, allures, zones, structure détaillée.
3. Utiliser les données Strava pour calibrer les allures et volumes de façon réaliste.
4. Si l'athlète montre des capacités supérieures au plan initial, ajuster à la hausse prudemment.
5. Si l'athlète montre des capacités inférieures, ajuster à la baisse pour éviter surcharge.
6. Garder la cohérence avec le type de semaine (récupération, normale, affûtage).
7. Chaque séance recalibrée DOIT avoir les mêmes champs détaillés que le plan original.

Réponds avec un tableau JSON de séances recalibrées. Chaque élément DOIT contenir:
- "id": l'id exact de la séance (obligatoire)
- Tous les champs de contenu ajustés: duration_target_minutes, distance_target_km, distance_target_meters, target_summary_label, primary_target_type, primary_target_value_text, secondary_target_value_text, warmup_summary, main_set_summary, cooldown_summary, workout_structure_json, structure_text, coach_note_short, intensity_zone_label, session_goal

Inclus TOUTES les séances futures, même celles non modifiées (retourne-les telles quelles).
Format: [{id, ...fields}, ...]`;

  return prompt;
}
