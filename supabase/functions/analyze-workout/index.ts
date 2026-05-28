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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Non autorisé");

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { completed_workout_id } = body;
    if (!completed_workout_id) throw new Error("completed_workout_id requis.");

    // Check for existing detailed analysis
    const { data: existingAnalysis } = await supabase
      .from("workout_analyses")
      .select("*")
      .eq("completed_workout_id", completed_workout_id)
      .eq("analysis_type", "detailed")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingAnalysis) {
      return new Response(JSON.stringify({ analysis: existingAnalysis }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load completed workout with related data
    const { data: cw } = await supabase
      .from("completed_workouts")
      .select("*")
      .eq("id", completed_workout_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!cw) throw new Error("Séance réalisée introuvable.");

    // Load planned workout if matched
    let planned: any = null;
    if (cw.planned_workout_id) {
      const { data: pw } = await supabase
        .from("planned_workouts")
        .select("*")
        .eq("id", cw.planned_workout_id)
        .maybeSingle();
      planned = pw;
    }

    // Load feedback if exists
    const { data: feedback } = await supabase
      .from("completed_workout_feedback")
      .select("*")
      .eq("completed_workout_id", completed_workout_id)
      .maybeSingle();

    // Load detailed activity data (laps, splits) if available
    let activityDetails: any = null;
    if (cw.imported_activity_id) {
      const { data: ia } = await supabase
        .from("imported_activities")
        .select("laps, splits_metric, max_power, max_speed")
        .eq("id", cw.imported_activity_id)
        .maybeSingle();
      activityDetails = ia;
    }

    const sportLabels: Record<string, string> = { swim: "natation", bike: "vélo", run: "course à pied" };
    const sportLabel = sportLabels[cw.sport_type] || cw.sport_type;

    const actualDurMin = cw.moving_time_seconds ? Math.round(cw.moving_time_seconds / 60) : null;
    const actualDistKm = cw.distance_meters ? Math.round(Number(cw.distance_meters) / 1000 * 10) / 10 : null;

    let plannedSummary = "Aucune séance prévue correspondante.";
    let actualSummary = `${sportLabel} — `;
    const actualParts: string[] = [];
    if (actualDurMin) actualParts.push(`${actualDurMin} min`);
    if (actualDistKm) actualParts.push(`${actualDistKm} km`);
    if (cw.avg_heartrate) actualParts.push(`FC moy. ${Math.round(Number(cw.avg_heartrate))} bpm`);
    if (cw.elevation_gain_meters) actualParts.push(`D+ ${Math.round(Number(cw.elevation_gain_meters))} m`);
    actualSummary += actualParts.join(", ") || "données limitées";

    if (planned) {
      const parts: string[] = [];
      parts.push(sportLabel);
      if (planned.duration_target_minutes) parts.push(`${planned.duration_target_minutes} min`);
      if (planned.distance_target_km) parts.push(`${Number(planned.distance_target_km)} km`);
      if (planned.intensity_zone_label) parts.push(`zone ${planned.intensity_zone_label}`);
      if (planned.session_goal) parts.push(`objectif: ${planned.session_goal}`);
      plannedSummary = parts.join(" — ");
    }

    // Use AI for detailed interpretation
    let comparisonText = "";
    let interpretationText = "";
    let vigilanceSignals: string[] = [];
    let conformityStatus = cw.conformity_status;
    let requiresReview = cw.requires_adjustment_review || false;

    if (lovableApiKey) {
      try {
        const prompt = buildAnalysisPrompt(cw, planned, feedback, sportLabel, actualSummary, plannedSummary, activityDetails);
        
        const aiRes = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "Tu es un coach d'endurance bienveillant et analytique. Tu analyses les séances d'entraînement. Réponds toujours en JSON valide." },
              { role: "user", content: prompt },
            ],
            temperature: 0.3,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          // Extract JSON from potential markdown code blocks
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
          try {
            const parsed = JSON.parse(jsonMatch[1]?.trim() || content.trim());
            comparisonText = parsed.comparison || "";
            interpretationText = parsed.interpretation || "";
            vigilanceSignals = parsed.vigilance_signals || [];
            if (parsed.conformity_status) conformityStatus = parsed.conformity_status;
            if (parsed.requires_adjustment_review !== undefined) requiresReview = parsed.requires_adjustment_review;
          } catch {
            comparisonText = content;
          }
        }
      } catch (e) {
        console.error("AI analysis error:", e);
      }
    }

    // Fallback if no AI
    if (!comparisonText) {
      comparisonText = buildFallbackComparison(cw, planned, sportLabel);
      interpretationText = buildFallbackInterpretation(cw, planned);
      vigilanceSignals = buildFallbackVigilance(cw, planned);
    }

    // Store detailed analysis
    const analysisData = {
      user_id: user.id,
      completed_workout_id,
      analysis_type: "detailed",
      conformity_status: conformityStatus,
      planned_summary: plannedSummary,
      actual_summary: actualSummary,
      comparison_text: comparisonText,
      interpretation_text: interpretationText,
      vigilance_signals: vigilanceSignals,
      requires_adjustment_review: requiresReview,
    };

    const { data: newAnalysis, error: insertErr } = await supabase
      .from("workout_analyses")
      .insert(analysisData)
      .select()
      .single();

    if (insertErr) {
      console.error("Analysis insert error:", insertErr);
      throw new Error("Erreur lors de la sauvegarde de l'analyse.");
    }

    return new Response(JSON.stringify({ analysis: newAnalysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("analyze-workout error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erreur" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildAnalysisPrompt(cw: any, planned: any, feedback: any, sportLabel: string, actualSummary: string, plannedSummary: string): string {
  let prompt = `Analyse cette séance d'entraînement de ${sportLabel}.

## Réalisé
${actualSummary}
${cw.activity_name ? `Nom: ${cw.activity_name}` : ""}

## Prévu
${plannedSummary}
`;

  if (planned) {
    if (planned.structure_text) prompt += `\nStructure prévue: ${planned.structure_text}`;
    if (planned.coach_note_short) prompt += `\nNote coach: ${planned.coach_note_short}`;
    if (planned.workout_priority) prompt += `\nPriorité: ${planned.workout_priority}`;
  }

  if (feedback) {
    prompt += `\n\n## Ressenti de l'athlète`;
    if (feedback.rpe) prompt += `\nRPE: ${feedback.rpe}/10`;
    if (feedback.fatigue_after) prompt += `\nFatigue après: ${feedback.fatigue_after}/5`;
    if (feedback.comment_text) prompt += `\nCommentaire: ${feedback.comment_text}`;
  }

  prompt += `

## Consignes
Réponds en JSON avec cette structure exacte:
{
  "comparison": "Texte comparant le prévu et le réalisé (2-4 phrases). Factuel.",
  "interpretation": "Interprétation prudente de ce que cela signifie pour l'entraînement (2-3 phrases). Bienveillante.",
  "conformity_status": "conform|partial|non_conform|free_workout",
  "vigilance_signals": ["signal 1 si pertinent"],
  "requires_adjustment_review": false
}

Règles:
- Distingue les faits observés de l'interprétation
- Reste prudent si les données sont incomplètes
- Évite les conclusions fortes sur un seul signal
- Une séance peut être partiellement conforme mais utile
- Une séance libre peut être utile, neutre ou perturbatrice
- Ne recommande un requires_adjustment_review que si l'écart est vraiment significatif`;

  return prompt;
}

function buildFallbackComparison(cw: any, planned: any, sportLabel: string): string {
  if (!planned) {
    return `Séance libre de ${sportLabel}. Aucune séance prévue ne correspondait à cette activité.`;
  }
  const parts: string[] = [];
  const actualMin = cw.moving_time_seconds ? Math.round(cw.moving_time_seconds / 60) : null;
  if (actualMin && planned.duration_target_minutes) {
    parts.push(`Durée: ${actualMin} min réalisées / ${planned.duration_target_minutes} min prévues.`);
  }
  const actualKm = cw.distance_meters ? Math.round(Number(cw.distance_meters) / 1000 * 10) / 10 : null;
  if (actualKm && planned.distance_target_km) {
    parts.push(`Distance: ${actualKm} km / ${Number(planned.distance_target_km)} km prévus.`);
  }
  return parts.length > 0 ? parts.join(" ") : "Données insuffisantes pour une comparaison détaillée.";
}

function buildFallbackInterpretation(cw: any, planned: any): string {
  if (!planned) return "Cette activité complémentaire sera prise en compte dans le suivi global de la charge.";
  return "La séance a été réalisée. Une analyse plus détaillée nécessiterait davantage de données.";
}

function buildFallbackVigilance(cw: any, planned: any): string[] {
  const signals: string[] = [];
  if (!planned && cw.moving_time_seconds && cw.moving_time_seconds > 5400) {
    signals.push("Séance libre longue (>90 min) — impact possible sur la récupération.");
  }
  if (planned?.workout_priority === "key" && cw.conformity_status === "non_conform") {
    signals.push("Séance clé non conforme — à surveiller pour la progression.");
  }
  return signals;
}
