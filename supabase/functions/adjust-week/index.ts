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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Non autorisé");
    const userId = user.id;

    const body = await req.json();
    const { week_id, constraint_id, action } = body;

    if (!week_id) throw new Error("week_id requis");

    // Action: apply proposal
    if (action === "apply") {
      return await applyProposal(supabase, userId, body.proposal_id, week_id);
    }

    // Action: reject proposal
    if (action === "reject") {
      if (!body.proposal_id) throw new Error("proposal_id requis");
      await supabase.from("weekly_adjustment_proposals")
        .update({ status: "rejected" })
        .eq("id", body.proposal_id)
        .eq("user_id", userId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default action: generate proposal
    // Load week data
    const { data: week, error: weekErr } = await supabase
      .from("training_weeks").select("*, training_blocks!inner(plan_id, name, focus)")
      .eq("id", week_id).single();
    if (weekErr || !week) throw new Error("Semaine introuvable");
    if (week.user_id !== userId) throw new Error("Non autorisé");

    // Load constraints
    let constraints: any = null;
    if (constraint_id) {
      const { data: c } = await supabase
        .from("weekly_constraints").select("*")
        .eq("id", constraint_id).eq("user_id", userId).single();
      constraints = c;
    }
    if (!constraints) throw new Error("Contraintes introuvables");

    // Load current workouts for this week
    const { data: currentWorkouts } = await supabase
      .from("planned_workouts").select("*")
      .eq("week_id", week_id).eq("user_id", userId)
      .order("scheduled_date");

    if (!currentWorkouts || currentWorkouts.length === 0) {
      throw new Error("Aucune séance à réorganiser cette semaine.");
    }

    // Load recent analyses for context
    const { data: recentAnalyses } = await supabase
      .from("workout_analyses").select("conformity_status, interpretation_text, vigilance_signals")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(5);

    // Build prompt
    const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
    
    const workoutsSummary = currentWorkouts.map((wo: any) => {
      const dayIdx = wo.scheduled_date ? new Date(wo.scheduled_date).getUTCDay() : null;
      const dayName = dayIdx !== null ? dayNames[dayIdx === 0 ? 6 : dayIdx - 1] : "?";
      return {
        id: wo.id,
        sport_type: wo.sport_type,
        workout_priority: wo.workout_priority,
        scheduled_date: wo.scheduled_date,
        day_name: dayName,
        duration_target_minutes: wo.duration_target_minutes,
        session_goal: wo.session_goal,
        intensity_zone_label: wo.intensity_zone_label,
        target_summary_label: wo.target_summary_label,
        distance_target_km: wo.distance_target_km,
        distance_target_meters: wo.distance_target_meters,
        status: wo.status,
      };
    });

    let constraintText = "";
    if (constraints.perceived_fatigue) constraintText += `Fatigue perçue: ${constraints.perceived_fatigue}/5\n`;
    if (constraints.life_load) constraintText += `Charge de vie: ${constraints.life_load}/5\n`;
    if (constraints.unavailable_days && (constraints.unavailable_days as number[]).length > 0) {
      const days = (constraints.unavailable_days as number[]).map((d: number) => dayNames[d]).join(", ");
      constraintText += `Jours indisponibles: ${days}\n`;
    }
    if (constraints.max_duration_per_day && Object.keys(constraints.max_duration_per_day).length > 0) {
      for (const [dayIdx, maxMin] of Object.entries(constraints.max_duration_per_day)) {
        constraintText += `${dayNames[parseInt(dayIdx)]}: max ${maxMin} minutes\n`;
      }
    }
    if (constraints.weekend_constraint) constraintText += `Contrainte week-end: ${constraints.weekend_constraint}\n`;
    if (constraints.free_text) constraintText += `Demande libre: ${constraints.free_text}\n`;
    if (constraints.sport_preferences_per_day && Object.keys(constraints.sport_preferences_per_day).length > 0) {
      for (const [dayIdx, sport] of Object.entries(constraints.sport_preferences_per_day)) {
        constraintText += `Préférence ${dayNames[parseInt(dayIdx)]}: ${sport}\n`;
      }
    }
    if (constraints.explicit_requests && (constraints.explicit_requests as any[]).length > 0) {
      constraintText += `Demandes explicites:\n`;
      for (const req of (constraints.explicit_requests as any[])) {
        if (req.type === "move") {
          const wo = currentWorkouts.find((w: any) => w.id === req.workout_id);
          constraintText += `- Déplacer "${wo?.session_goal || wo?.sport_type}" vers ${dayNames[req.target_day]}\n`;
        } else if (req.type === "protect") {
          const wo = currentWorkouts.find((w: any) => w.id === req.workout_id);
          constraintText += `- Protéger "${wo?.session_goal || wo?.sport_type}"\n`;
        }
      }
    }

    let vigilanceContext = "";
    if (recentAnalyses && recentAnalyses.length > 0) {
      const signals = recentAnalyses.filter((a: any) => a.vigilance_signals && (a.vigilance_signals as any[]).length > 0);
      if (signals.length > 0) {
        vigilanceContext = `\nSIGNAUX DE VIGILANCE RÉCENTS:\n${signals.map((s: any) => `- ${JSON.stringify(s.vigilance_signals)}`).join("\n")}\n`;
      }
    }

    const prompt = `Tu es un coach d'endurance expert. L'utilisateur veut réorganiser sa semaine ${week.week_number} (type: ${week.week_type}).
Bloc: ${(week as any).training_blocks?.name || "?"}, Focus: ${(week as any).training_blocks?.focus || "?"}
Semaine du ${week.start_date || "?"} au ${week.end_date || "?"}

SÉANCES ACTUELLES:
${JSON.stringify(workoutsSummary, null, 2)}

CONTRAINTES DE L'UTILISATEUR:
${constraintText}
${vigilanceContext}

RÈGLES:
1. PROTÉGER les séances "key" en priorité. Ne les supprimer qu'en dernier recours.
2. Tu peux: déplacer, alléger (réduire durée/intensité), reprioriser, annuler une séance optionnelle, remplacer par une version simplifiée.
3. NE PAS: casser plusieurs séances clés, remanier tout le bloc, rattraper artificiellement toute la charge.
4. Respecter les jours indisponibles et les durées max.
5. Si l'utilisateur demande explicitement de déplacer ou protéger une séance, essaie de le faire.
6. Le week-end doit respecter la contrainte week-end si renseignée.
7. Chaque séance proposée doit avoir un scheduled_date valide entre ${week.start_date} et ${week.end_date}.

Réponds UNIQUEMENT avec un JSON valide (pas de markdown) au format:
{
  "proposed_workouts": [
    {
      "original_id": "uuid de la séance originale ou null si nouvelle",
      "sport_type": "swim|bike|run|strength|mobility|rest",
      "workout_priority": "key|important|optional",
      "scheduled_date": "YYYY-MM-DD",
      "duration_target_minutes": number,
      "session_goal": "texte court",
      "intensity_zone_label": "zone",
      "target_summary_label": "résumé cible",
      "status": "planned|cancelled",
      "change_type": "kept|moved|lightened|cancelled|reprioritized|replaced",
      "change_reason": "explication courte du changement"
    }
  ],
  "protected_workouts": [{"id": "uuid", "reason": "pourquoi protégé"}],
  "sacrificed_workouts": [{"id": "uuid", "reason": "pourquoi sacrifié"}],
  "changes_summary": "résumé en 2-3 phrases de ce qui change et pourquoi",
  "detailed_explanation": "explication détaillée des arbitrages"
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu es un coach d'endurance expert. Tu réorganises des semaines d'entraînement en respectant les contraintes de l'utilisateur. Réponds UNIQUEMENT avec du JSON valide, sans markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 8192,
      }),
    });

    if (!aiRes.ok) {
      console.error("AI error:", await aiRes.text());
      throw new Error("Erreur lors de la génération de la proposition.");
    }

    const aiData = await aiRes.json();
    let rawContent = aiData.choices?.[0]?.message?.content || "";
    rawContent = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    let proposalData: any;
    try {
      proposalData = JSON.parse(rawContent);
    } catch {
      console.error("Failed to parse proposal JSON:", rawContent.substring(0, 500));
      throw new Error("Erreur de format dans la proposition. Réessaie.");
    }

    // Save the proposal
    const originalWorkoutsSnapshot = currentWorkouts.map((wo: any) => ({
      id: wo.id,
      sport_type: wo.sport_type,
      workout_priority: wo.workout_priority,
      scheduled_date: wo.scheduled_date,
      duration_target_minutes: wo.duration_target_minutes,
      session_goal: wo.session_goal,
      intensity_zone_label: wo.intensity_zone_label,
      target_summary_label: wo.target_summary_label,
      status: wo.status,
    }));

    const { data: proposal, error: propErr } = await supabase
      .from("weekly_adjustment_proposals")
      .insert({
        user_id: userId,
        week_id,
        constraint_id: constraint_id || null,
        status: "pending",
        proposed_workouts: proposalData.proposed_workouts || [],
        original_workouts: originalWorkoutsSnapshot,
        changes_summary: proposalData.changes_summary || null,
        detailed_explanation: proposalData.detailed_explanation || null,
        protected_workouts: proposalData.protected_workouts || [],
        sacrificed_workouts: proposalData.sacrificed_workouts || [],
      })
      .select()
      .single();

    if (propErr) throw propErr;

    // Mark constraint as processed
    if (constraint_id) {
      await supabase.from("weekly_constraints")
        .update({ status: "processed" })
        .eq("id", constraint_id).eq("user_id", userId);
    }

    return new Response(JSON.stringify({ success: true, proposal }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Adjust-week error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erreur lors de l'ajustement." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function applyProposal(supabase: any, userId: string, proposalId: string, weekId: string) {
  if (!proposalId) throw new Error("proposal_id requis");

  const { data: proposal, error: propErr } = await supabase
    .from("weekly_adjustment_proposals").select("*")
    .eq("id", proposalId).eq("user_id", userId).single();
  if (propErr || !proposal) throw new Error("Proposition introuvable");
  if (proposal.status !== "pending") throw new Error("Cette proposition a déjà été traitée.");

  // Get the plan_id from the week
  const { data: week } = await supabase
    .from("training_weeks").select("block_id, training_blocks!inner(plan_id)")
    .eq("id", weekId).single();
  if (!week) throw new Error("Semaine introuvable");
  const planId = (week as any).training_blocks.plan_id;

  // Create plan_adjustment record
  const { data: adjustment, error: adjErr } = await supabase
    .from("plan_adjustments")
    .insert({
      user_id: userId,
      plan_id: planId,
      week_id: weekId,
      constraint_id: proposal.constraint_id,
      proposal_id: proposalId,
      adjustment_type: "weekly_reorganization",
      reason_summary: proposal.changes_summary,
      detailed_summary: proposal.detailed_explanation,
    })
    .select().single();
  if (adjErr) throw adjErr;

  // Load current workouts
  const { data: currentWorkouts } = await supabase
    .from("planned_workouts").select("*")
    .eq("week_id", weekId).eq("user_id", userId);

  const proposedWorkouts = proposal.proposed_workouts as any[];

  // Version and update each workout
  for (const proposed of proposedWorkouts) {
    const original = currentWorkouts?.find((w: any) => w.id === proposed.original_id);
    
    if (original && proposed.change_type !== "kept") {
      // Count existing versions
      const { count } = await supabase
        .from("planned_workout_versions")
        .select("id", { count: "exact", head: true })
        .eq("workout_id", original.id);

      // Save version snapshot
      await supabase.from("planned_workout_versions").insert({
        workout_id: original.id,
        user_id: userId,
        version_number: (count || 0) + 1,
        snapshot: original,
        change_reason: proposed.change_reason || proposal.changes_summary,
        adjustment_id: adjustment.id,
      });

      // Update the workout
      const updates: any = {};
      if (proposed.scheduled_date) updates.scheduled_date = proposed.scheduled_date;
      if (proposed.duration_target_minutes !== undefined) updates.duration_target_minutes = proposed.duration_target_minutes;
      if (proposed.session_goal) updates.session_goal = proposed.session_goal;
      if (proposed.intensity_zone_label) updates.intensity_zone_label = proposed.intensity_zone_label;
      if (proposed.target_summary_label) updates.target_summary_label = proposed.target_summary_label;
      if (proposed.workout_priority) updates.workout_priority = proposed.workout_priority;
      if (proposed.status) updates.status = proposed.status;
      if (proposed.sport_type) updates.sport_type = proposed.sport_type;

      await supabase.from("planned_workouts")
        .update(updates)
        .eq("id", original.id).eq("user_id", userId);

      // Record impacted workout
      await supabase.from("adjustment_impacted_workouts").insert({
        adjustment_id: adjustment.id,
        user_id: userId,
        workout_id: original.id,
        change_type: proposed.change_type,
        old_values: {
          scheduled_date: original.scheduled_date,
          duration_target_minutes: original.duration_target_minutes,
          workout_priority: original.workout_priority,
          status: original.status,
        },
        new_values: updates,
      });
    }
  }

  // Mark proposal as accepted
  await supabase.from("weekly_adjustment_proposals")
    .update({ status: "accepted" })
    .eq("id", proposalId).eq("user_id", userId);

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };

  return new Response(JSON.stringify({ success: true, adjustment_id: adjustment.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
