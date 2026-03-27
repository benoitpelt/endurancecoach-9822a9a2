import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Get user from JWT
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Non autorisé");
    const userId = user.id;

    // Load all user data in parallel
    const [profileRes, goalRes, enrichedRes, metricsRes, availRes] = await Promise.all([
      supabase.from("athlete_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("race_goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("athlete_enriched_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("athlete_metric_history").select("*").eq("user_id", userId).order("observed_at", { ascending: false }).limit(20),
      supabase.from("default_availability_rules").select("*").eq("user_id", userId).order("day_of_week"),
    ]);

    const profile = profileRes.data;
    const goal = goalRes.data;
    const enriched = enrichedRes.data;
    const metrics = metricsRes.data || [];
    const availability = availRes.data || [];

    if (!goal) {
      return new Response(JSON.stringify({ error: "Aucun objectif trouvé. Définis d'abord un objectif sportif." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context for AI
    const today = new Date().toISOString().split("T")[0];
    const targetDate = goal.target_date || null;
    let weeksUntilRace = 12;
    if (targetDate) {
      const diff = Math.floor((new Date(targetDate).getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000));
      weeksUntilRace = Math.max(4, Math.min(diff, 24));
    }

    const availDays = availability.filter((a: any) => a.is_available).map((a: any) => ({
      day: a.day_of_week,
      maxMin: a.max_duration_minutes || 60,
      note: a.note,
    }));

    const prompt = buildPrompt({
      today, targetDate, weeksUntilRace, goal, profile, enriched, metrics, availDays,
    });

    // Call Lovable AI
    const aiRes = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu es un coach d'endurance expert en triathlon, course à pied et vélo. Tu génères des plans d'entraînement structurés au format JSON strict. Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans commentaire." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", errText);
      throw new Error("Erreur lors de la génération du plan.");
    }

    const aiData = await aiRes.json();
    let rawContent = aiData.choices?.[0]?.message?.content || "";
    
    // Strip markdown code fences if present
    rawContent = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    
    let planData: any;
    try {
      planData = JSON.parse(rawContent);
    } catch {
      console.error("Failed to parse AI response:", rawContent.substring(0, 500));
      throw new Error("Erreur de format dans la réponse du générateur.");
    }

    // Delete any existing draft plans for this user
    const { data: existingPlans } = await supabase
      .from("training_plans")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["draft", "active"]);

    if (existingPlans && existingPlans.length > 0) {
      const planIds = existingPlans.map((p: any) => p.id);
      // Get block ids
      const { data: existingBlocks } = await supabase
        .from("training_blocks")
        .select("id")
        .in("plan_id", planIds);
      if (existingBlocks && existingBlocks.length > 0) {
        const blockIds = existingBlocks.map((b: any) => b.id);
        const { data: existingWeeks } = await supabase
          .from("training_weeks")
          .select("id")
          .in("block_id", blockIds);
        if (existingWeeks && existingWeeks.length > 0) {
          const weekIds = existingWeeks.map((w: any) => w.id);
          await supabase.from("planned_workouts").delete().in("week_id", weekIds);
        }
        await supabase.from("training_weeks").delete().in("block_id", blockIds);
      }
      await supabase.from("training_blocks").delete().in("plan_id", planIds);
      await supabase.from("training_plans").delete().in("id", planIds);
    }

    // Create the plan
    const { data: newPlan, error: planErr } = await supabase
      .from("training_plans")
      .insert({
        user_id: userId,
        name: planData.plan_name || `Plan ${goal.event_name || goal.format || goal.goal_type}`,
        status: "active",
        goal_id: goal.id,
        start_date: planData.start_date || today,
        end_date: planData.end_date || null,
        notes: planData.plan_explanation || null,
      })
      .select()
      .single();

    if (planErr) throw planErr;

    // Create blocks, weeks, workouts
    const blocks = planData.blocks || [];
    let globalWeekNum = 1;

    for (let bi = 0; bi < blocks.length; bi++) {
      const block = blocks[bi];
      const { data: newBlock, error: bErr } = await supabase
        .from("training_blocks")
        .insert({
          plan_id: newPlan.id,
          user_id: userId,
          name: block.name || `Bloc ${bi + 1}`,
          block_order: bi,
          focus: block.focus || null,
          start_date: block.start_date || null,
          end_date: block.end_date || null,
          notes: block.notes || null,
        })
        .select()
        .single();

      if (bErr) throw bErr;

      const weeks = block.weeks || [];
      for (let wi = 0; wi < weeks.length; wi++) {
        const week = weeks[wi];
        const { data: newWeek, error: wErr } = await supabase
          .from("training_weeks")
          .insert({
            block_id: newBlock.id,
            user_id: userId,
            week_number: globalWeekNum,
            week_type: week.week_type || "normal",
            start_date: week.start_date || null,
            end_date: week.end_date || null,
            notes: week.notes || null,
          })
          .select()
          .single();

        if (wErr) throw wErr;

        const workouts = week.workouts || [];
        if (workouts.length > 0) {
          const inserts = workouts.map((wo: any) => ({
            week_id: newWeek.id,
            user_id: userId,
            sport_type: wo.sport_type || "run",
            scheduled_date: wo.scheduled_date || null,
            duration_target_minutes: wo.duration_target_minutes || null,
            distance_target_km: wo.distance_target_km || null,
            workout_priority: wo.workout_priority || "important",
            status: "planned",
            session_goal: wo.session_goal || null,
            intensity_zone_label: wo.intensity_zone_label || null,
            structure_text: wo.structure_text || null,
            coach_note_short: wo.coach_note_short || null,
            created_by_type: "ai_generation",
            carb_strategy_type: wo.carb_strategy_type || null,
            carb_before_g: wo.carb_before_g || null,
            carb_during_g_per_hour: wo.carb_during_g_per_hour || null,
            carb_total_target_g: wo.carb_total_target_g || null,
            hydration_note: wo.hydration_note || null,
            gut_training_priority: wo.gut_training_priority || null,
          }));

          const { error: woErr } = await supabase.from("planned_workouts").insert(inserts);
          if (woErr) throw woErr;
        }

        globalWeekNum++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        plan_id: newPlan.id,
        plan_explanation: planData.plan_explanation || "",
        generation_notes: planData.generation_notes || "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Generation error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erreur lors de la génération." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildPrompt(ctx: any): string {
  const { today, targetDate, weeksUntilRace, goal, profile, enriched, metrics, availDays } = ctx;

  const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

  let userContext = `Date d'aujourd'hui: ${today}\n`;
  if (targetDate) userContext += `Date de course cible: ${targetDate} (${weeksUntilRace} semaines)\n`;
  else userContext += `Pas de date cible précise. Génère un plan de ${weeksUntilRace} semaines.\n`;

  userContext += `\nOBJECTIF:\n`;
  userContext += `- Type: ${goal.goal_type}\n`;
  if (goal.format) userContext += `- Format: ${goal.format}\n`;
  if (goal.event_name) userContext += `- Événement: ${goal.event_name}\n`;
  if (goal.primary_objective) userContext += `- Objectif principal: ${goal.primary_objective}\n`;
  if (goal.target_time) userContext += `- Temps visé: ${goal.target_time}\n`;

  if (profile) {
    userContext += `\nPROFIL:\n`;
    if (profile.sex) userContext += `- Sexe: ${profile.sex}\n`;
    if (profile.date_of_birth) userContext += `- Date de naissance: ${profile.date_of_birth}\n`;
    if (profile.weight_kg) userContext += `- Poids: ${profile.weight_kg}kg\n`;
    userContext += `- Piscine: ${profile.pool_access ? "Oui" : "Non"}\n`;
    userContext += `- Home trainer: ${profile.home_trainer ? "Oui" : "Non"}\n`;
    userContext += `- Salle: ${profile.gym_access ? "Oui" : "Non"}\n`;
  }

  if (enriched) {
    userContext += `\nPROFIL ENRICHI:\n`;
    if (enriched.sessions_per_week) userContext += `- Séances/semaine actuelles: ${enriched.sessions_per_week}\n`;
    if (enriched.max_sessions_per_week) userContext += `- Max séances/semaine: ${enriched.max_sessions_per_week}\n`;
    if (enriched.strongest_discipline) userContext += `- Point fort: ${enriched.strongest_discipline}\n`;
    if (enriched.weakest_discipline) userContext += `- Point faible: ${enriched.weakest_discipline}\n`;
    if (enriched.longest_recent_run) userContext += `- Plus longue course récente: ${enriched.longest_recent_run}\n`;
    if (enriched.longest_recent_bike) userContext += `- Plus longue sortie vélo récente: ${enriched.longest_recent_bike}\n`;
    if (enriched.longest_recent_swim) userContext += `- Plus longue nage récente: ${enriched.longest_recent_swim}\n`;
    if (enriched.strength_training) userContext += `- Fait du renforcement: Oui\n`;
    if (enriched.injuries_constraints) userContext += `- Contraintes/blessures: ${enriched.injuries_constraints}\n`;
    if (enriched.preferred_sessions) userContext += `- Séances préférées: ${enriched.preferred_sessions}\n`;
    if (enriched.disliked_sessions) userContext += `- Séances détestées: ${enriched.disliked_sessions}\n`;
    if (enriched.plan_failure_reason) userContext += `- Raisons d'échec de plans passés: ${enriched.plan_failure_reason}\n`;
    if (enriched.performances && Object.keys(enriched.performances).length > 0) {
      userContext += `- Performances: ${JSON.stringify(enriched.performances)}\n`;
    }
    if (enriched.weekly_volume_hours && Object.keys(enriched.weekly_volume_hours).length > 0) {
      userContext += `- Volume hebdo: ${JSON.stringify(enriched.weekly_volume_hours)}\n`;
    }
  }

  if (metrics.length > 0) {
    userContext += `\nMÉTRIQUES RÉCENTES:\n`;
    for (const m of metrics.slice(0, 10)) {
      userContext += `- ${m.metric_type}: ${m.metric_value} ${m.metric_unit || ""} (${m.observed_at || ""})\n`;
    }
  }

  if (availDays.length > 0) {
    userContext += `\nDISPONIBILITÉS:\n`;
    for (const d of availDays) {
      userContext += `- ${dayNames[d.day]}: max ${d.maxMin} min${d.note ? " (" + d.note + ")" : ""}\n`;
    }
  } else {
    userContext += `\nDISPONIBILITÉS: Non renseignées, utilise 4-5 séances/semaine par défaut.\n`;
  }

  return `${userContext}

CONSIGNES DE GÉNÉRATION:
- Génère un plan de ${weeksUntilRace} semaines structuré en blocs de 3 semaines + 1 semaine récupération.
- Dernier bloc: affûtage puis semaine de course si date cible connue.
- Répartition 80/20 (80% zone 1-2, 20% intensité).
- Respecte les disponibilités. Si limitées, réduis le nombre de séances plutôt que tout raccourcir.
- Au moins 1 séance de chaque discipline (natation/vélo/course) par semaine si triathlon. 
- Chaque séance a une priorité: "key" (2-3/semaine), "important" (1-2), "optional" (le reste).
- Natation clé = technique. Vélo clé = sortie longue. Course clé = allure spécifique.
- Progression modérée, prudence blessure.
- Si données manquantes, reste prudent avec des volumes modérés.

CALIBRATION DU VOLUME PAR RAPPORT À L'OBJECTIF:
IMPORTANT: Le profil athlète définit le point de départ et la vitesse de progression, PAS un plafond.
L'objectif sportif définit la trajectoire de charge cible. Le plan doit converger progressivement vers un volume cohérent avec l'événement visé.
Un plan prudent n'est PAS un plan sous-dimensionné. Évite de produire un plan trop léger pour être crédible face à l'objectif.

${getEventVolumeGuidelines(goal)}

RÈGLES DE VOLUME:
- Les semaines de récupération = environ 60-65% du volume de la semaine précédente (pas vide).
- Les séances longues sont les piliers structurels du plan. Elles doivent exister et progresser clairement.
- Le volume hebdo total doit progresser bloc après bloc, pas stagner.
- Les premières semaines partent du niveau actuel de l'athlète (ou d'une estimation prudente).
- Les dernières semaines de développement (peak) doivent atteindre un volume réaliste pour l'objectif.
- L'affûtage réduit le volume mais maintient l'intensité.

NUTRITION PAR SÉANCE:
Pour les sorties longues (>60min vélo, >50min course), les bricks et séances spécifiques longues:
- Remplis carb_strategy_type: "none" | "optional_low" | "moderate" | "high" | "gut_training" | "race_strategy"
- carb_during_g_per_hour: 0 pour none, 20-30 pour optional_low, 40-60 pour moderate, 60-90 pour high
- carb_before_g: 20-40g pour séances >45min
- hydration_note: conseil simple
- gut_training_priority: "low" | "medium" | "high" pour séances longues
Pour séances courtes (<45min) ou repos: ne mets PAS de champs nutrition (null).

IMPORTANT: La nutrition n'est pas une prescription médicale mais une consigne d'entraînement nutritionnel.

Réponds UNIQUEMENT avec ce JSON (pas de markdown):
{
  "plan_name": "string",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "plan_explanation": "string (2-4 phrases expliquant la logique du plan, le volume, la répartition, le ton coach rassurant)",
  "generation_notes": "string (notes sur les hypothèses prises si profil incomplet)",
  "blocks": [
    {
      "name": "string",
      "focus": "string",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "notes": "string|null",
      "weeks": [
        {
          "week_type": "normal|recovery|taper|race_week",
          "start_date": "YYYY-MM-DD",
          "end_date": "YYYY-MM-DD",
          "notes": "string|null",
          "workouts": [
            {
              "sport_type": "swim|bike|run|strength|mobility|rest",
              "scheduled_date": "YYYY-MM-DD",
              "duration_target_minutes": number,
              "distance_target_km": number|null,
              "workout_priority": "key|important|optional",
              "session_goal": "string",
              "intensity_zone_label": "string",
              "structure_text": "string (détail de la séance sur plusieurs lignes)",
              "coach_note_short": "string|null",
              "carb_strategy_type": "string|null",
              "carb_before_g": number|null,
              "carb_during_g_per_hour": number|null,
              "carb_total_target_g": number|null,
              "hydration_note": "string|null",
              "gut_training_priority": "string|null"
            }
          ]
        }
      ]
    }
  ]
}`;
}

function getEventVolumeGuidelines(goal: any): string {
  const format = (goal.format || "").toLowerCase();
  const goalType = (goal.goal_type || "").toLowerCase();

  if (format.includes("ironman") || format.includes("long") || format.includes("full") || format.includes("im")) {
    return `REPÈRES VOLUME IRONMAN (FULL DISTANCE):
- Volume hebdo peak: 12-16h (minimum 10h pour un plan crédible).
- Sortie longue vélo peak: 4h30-6h.
- Sortie longue course peak: 2h15-3h.
- Séance longue natation: 60-90min.
- Brick long (vélo+course): au moins 1 toutes les 2-3 semaines en phase spécifique.
- Semaines normales de développement: 8-14h selon la phase.
- Semaines de récupération: 5-9h (pas en dessous de 5h).
- Première semaine du plan: partir du volume actuel de l'athlète ou 5-7h si inconnu.
- 5-7 séances/semaine en phase de développement, 4-6 en récupération.`;
  }

  if (format.includes("half") || format.includes("70.3") || format.includes("mi")) {
    return `REPÈRES VOLUME HALF-IRONMAN / 70.3:
- Volume hebdo peak: 8-12h.
- Sortie longue vélo peak: 3h-4h30.
- Sortie longue course peak: 1h30-2h15.
- Séance longue natation: 50-75min.
- Semaines normales de développement: 6-10h.
- Semaines de récupération: 4-6h.
- Première semaine: partir du volume actuel ou 4-6h si inconnu.
- 5-6 séances/semaine en développement.`;
  }

  if (format.includes("olympic") || format.includes("m") || format.includes("cd") || format.includes("distance olympique")) {
    return `REPÈRES VOLUME TRIATHLON OLYMPIQUE:
- Volume hebdo peak: 6-9h.
- Sortie longue vélo peak: 2h-3h.
- Sortie longue course peak: 1h15-1h45.
- Séance longue natation: 45-60min.
- Semaines normales: 5-8h.
- Semaines de récupération: 3-5h.
- 4-6 séances/semaine.`;
  }

  if (format.includes("sprint") || format.includes("xs") || format.includes("s")) {
    return `REPÈRES VOLUME TRIATHLON SPRINT:
- Volume hebdo peak: 4-7h.
- Sortie longue vélo peak: 1h30-2h30.
- Sortie longue course peak: 50min-1h15.
- Semaines normales: 3-6h.
- Semaines de récupération: 2-4h.
- 4-5 séances/semaine.`;
  }

  if (goalType.includes("marathon") && !goalType.includes("semi") && !goalType.includes("half")) {
    return `REPÈRES VOLUME MARATHON:
- Volume hebdo peak: 8-12h (60-90 km/semaine).
- Sortie longue course peak: 2h30-3h30.
- Semaines normales: 6-10h.
- Semaines de récupération: 4-6h.
- 5-6 séances/semaine.`;
  }

  if (goalType.includes("semi") || goalType.includes("half marathon")) {
    return `REPÈRES VOLUME SEMI-MARATHON:
- Volume hebdo peak: 5-8h (40-65 km/semaine).
- Sortie longue course peak: 1h45-2h15.
- Semaines normales: 4-7h.
- Semaines de récupération: 3-5h.
- 4-5 séances/semaine.`;
  }

  return `REPÈRES VOLUME GÉNÉRAUX:
- Adapte le volume peak à l'objectif visé.
- Un plan crédible doit avoir un volume cohérent avec la distance/durée de l'épreuve cible.
- Les séances longues doivent être proportionnelles à l'épreuve.
- Ne sous-dimensionne pas le plan.`;
}
