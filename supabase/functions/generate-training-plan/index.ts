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

    // Get user from JWT
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Non autorisé");
    const userId = user.id;

    // Load all user data in parallel
    const [profileRes, goalRes, enrichedRes, metricsRes, availRes, recentWorkoutsRes] = await Promise.all([
      supabase.from("athlete_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("race_goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("athlete_enriched_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("athlete_metric_history").select("*").eq("user_id", userId).order("observed_at", { ascending: false }).limit(20),
      supabase.from("default_availability_rules").select("*").eq("user_id", userId).order("day_of_week"),
      supabase.from("completed_workouts").select("sport_type, duration_seconds, distance_meters, avg_heartrate, avg_power, avg_speed, start_date, conformity_status, activity_name").eq("user_id", userId).order("start_date", { ascending: false }).limit(15),
    ]);

    const profile = profileRes.data;
    const goal = goalRes.data;
    const enriched = enrichedRes.data;
    const metrics = metricsRes.data || [];
    const availability = availRes.data || [];
    const recentWorkouts = recentWorkoutsRes.data || [];

    if (!goal) {
      return new Response(JSON.stringify({ error: "Aucun objectif trouvé. Définis d'abord un objectif sportif." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context for AI
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const targetDate = goal.target_date || null;

    const dayOfWeek = now.getUTCDay();
    const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
    const firstSunday = new Date(now);
    firstSunday.setUTCDate(firstSunday.getUTCDate() + daysUntilSunday);
    const firstSundayStr = firstSunday.toISOString().split("T")[0];
    const isPartialFirstWeek = dayOfWeek !== 1;
    const firstMondayAfter = new Date(firstSunday);
    firstMondayAfter.setUTCDate(firstMondayAfter.getUTCDate() + 1);
    const firstMondayAfterStr = firstMondayAfter.toISOString().split("T")[0];

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
      isPartialFirstWeek, firstSundayStr, firstMondayAfterStr, recentWorkouts,
    });

    // Call Lovable AI
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Tu es un coach d'endurance expert en triathlon, course à pied et vélo. Tu génères des plans d'entraînement structurés au format JSON strict avec des séances détaillées et prescriptives. Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans commentaire." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 65536,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", errText);
      throw new Error("Erreur lors de la génération du plan.");
    }

    const aiText = await aiRes.text();
    if (!aiText || aiText.trim().length === 0) {
      console.error("AI returned empty response");
      throw new Error("La réponse du générateur est vide. Réessaie.");
    }

    let aiData: any;
    try {
      aiData = JSON.parse(aiText);
    } catch (e) {
      console.error("Failed to parse AI gateway response:", aiText.substring(0, 300));
      throw new Error("Erreur de communication avec le générateur.");
    }

    let rawContent = aiData.choices?.[0]?.message?.content || "";
    
    const finishReason = aiData.choices?.[0]?.finish_reason;
    if (finishReason === "length") {
      console.error("AI response truncated (finish_reason=length)");
      throw new Error("Le plan généré est trop long et a été tronqué. Réessaie.");
    }

    rawContent = rawContent.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    let planData: any;
    try {
      planData = JSON.parse(rawContent);
    } catch {
      console.error("Failed to parse plan JSON:", rawContent.substring(0, 500));
      throw new Error("Erreur de format dans la réponse du générateur. Réessaie.");
    }

    // Archive existing active/draft plans instead of deleting them
    const { data: existingPlans } = await supabase
      .from("training_plans")
      .select("id")
      .eq("user_id", userId)
      .in("status", ["draft", "active"]);

    const sourcePlanId = existingPlans?.[0]?.id || null;

    if (existingPlans && existingPlans.length > 0) {
      const planIds = existingPlans.map((p: any) => p.id);
      await supabase
        .from("training_plans")
        .update({ status: "archived" })
        .in("id", planIds);
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
            distance_target_meters: wo.distance_target_meters || null,
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
            target_summary_label: wo.target_summary_label || null,
            primary_target_type: wo.primary_target_type || null,
            primary_target_value_text: wo.primary_target_value_text || null,
            secondary_target_value_text: wo.secondary_target_value_text || null,
            warmup_summary: wo.warmup_summary || null,
            main_set_summary: wo.main_set_summary || null,
            cooldown_summary: wo.cooldown_summary || null,
            workout_structure_json: wo.workout_structure_json || null,
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
  const { today, targetDate, weeksUntilRace, goal, profile, enriched, metrics, availDays, isPartialFirstWeek, firstSundayStr, firstMondayAfterStr, recentWorkouts } = ctx;

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

  // Add observed workout data for calibration
  if (recentWorkouts && recentWorkouts.length > 0) {
    userContext += `\nSÉANCES RÉCENTES RÉALISÉES (pour calibration):\n`;
    for (const rw of recentWorkouts) {
      const dur = rw.duration_seconds ? `${Math.round(rw.duration_seconds / 60)}min` : "";
      const dist = rw.distance_meters ? `${(rw.distance_meters / 1000).toFixed(1)}km` : "";
      const hr = rw.avg_heartrate ? `FC moy ${Math.round(rw.avg_heartrate)}` : "";
      const pwr = rw.avg_power ? `Puissance moy ${Math.round(rw.avg_power)}W` : "";
      const spd = rw.avg_speed ? `Vitesse moy ${rw.avg_speed.toFixed(1)}m/s` : "";
      const parts = [rw.sport_type, dur, dist, hr, pwr, spd].filter(Boolean).join(", ");
      userContext += `- ${rw.start_date?.split("T")[0] || "?"}: ${parts}\n`;
    }
    userContext += `IMPORTANT: Utilise ces données observées pour calibrer les allures, puissances et volumes des prochaines séances. Si l'athlète montre qu'il peut tenir un certain volume ou une certaine allure, ne sous-dimensionne pas les séances suivantes.\n`;
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

ALIGNEMENT CALENDAIRE (OBLIGATOIRE):
- TOUTES les semaines d'entraînement DOIVENT être alignées sur des semaines calendaires: Lundi → Dimanche.
- Les scheduled_date des séances doivent tomber entre le start_date (lundi) et end_date (dimanche) de leur semaine.
${isPartialFirstWeek
  ? `- SEMAINE PARTIELLE: Le plan commence aujourd'hui (${today}). La première semaine est partielle: du ${today} au ${firstSundayStr}. Son week_type doit être "normal" avec un volume adapté au nombre de jours restants. Les séances ne doivent être planifiées que sur les jours disponibles de cette semaine partielle.
- La deuxième semaine commence le lundi ${firstMondayAfterStr} et toutes les semaines suivantes sont des semaines calendaires complètes (Lundi → Dimanche).`
  : `- Aujourd'hui est un lundi. La première semaine commence le ${today} (lundi) et finit le dimanche suivant.`}
- Les blocs doivent commencer un lundi (sauf si le premier bloc contient la semaine partielle) et finir un dimanche.
- Ne génère JAMAIS de semaines vendredi→vendredi ou tout autre découpage non-calendaire.

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

SÉANCES PRESCRIPTIVES (OBLIGATOIRE):
Chaque séance swim/bike/run DOIT être concrète et détaillée. Pas de séance vague ou sous-dimensionnée.

Pour CHAQUE séance, tu DOIS fournir:
- duration_target_minutes: durée totale en minutes
- distance_target_km: distance totale en km (si pertinent, ex: course, vélo outdoor)
- distance_target_meters: distance totale en mètres (OBLIGATOIRE pour natation)
- target_summary_label: résumé court de la cible (ex: "3000m Z2 + 6x100m vite", "1h30 Z2 vélo", "10km allure 5:15/km")
- primary_target_type: "pace" | "power" | "css" | "hr" | "rpe" | "zone"
- primary_target_value_text: valeur lisible (ex: "5:15/km", "200W", "1:50/100m", "Z2")
- secondary_target_value_text: cible secondaire optionnelle (ex: "FC <145bpm", "RPE 6-7")
- warmup_summary: description de l'échauffement (ex: "400m crawl progressif + 4x50m éducatifs")
- main_set_summary: description du bloc principal (ex: "6x400m à 1:55/100m, r=30s")
- cooldown_summary: description du retour au calme (ex: "200m souple")
- workout_structure_json: tableau JSON des blocs structurés

RÈGLES PAR SPORT:

NATATION:
- distance_target_meters OBLIGATOIRE (pas seulement distance_target_km)
- Blocs en mètres: 50, 100, 200, 300, 400m
- Cible d'allure en min:sec/100m ou CSS
- Pour un objectif longue distance: séances de 2500m à 4000m+ possibles
- Ne PAS réduire la natation à une petite séance technique légère si le contexte demande du volume
- Inclure warm-up, bloc principal, cool-down avec distances

VÉLO:
- Durée totale claire
- Puissance cible si données disponibles (FTP, puissance moyenne observée)
- Sinon FC ou RPE
- Blocs structurés (ex: "3x10min à 220W, r=5min")

COURSE:
- Durée totale ET distance quand possible
- Allure cible prioritaire (min:sec/km)
- FC ou RPE en fallback
- Blocs structurés (ex: "6x1km à 4:45/km, r=1min30")

FORMAT workout_structure_json (tableau de blocs):
[
  {"phase": "warmup", "description": "400m crawl progressif", "duration_min": 8, "distance_m": 400, "target": "souple"},
  {"phase": "main", "description": "6x400m", "duration_min": 30, "distance_m": 2400, "target": "1:55/100m", "rest": "30s"},
  {"phase": "cooldown", "description": "200m souple", "duration_min": 5, "distance_m": 200, "target": "souple"}
]

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
              "duration_target_minutes": "number",
              "distance_target_km": "number|null",
              "distance_target_meters": "number|null (OBLIGATOIRE pour natation)",
              "workout_priority": "key|important|optional",
              "session_goal": "string",
              "intensity_zone_label": "string",
              "target_summary_label": "string (résumé court et concret)",
              "primary_target_type": "pace|power|css|hr|rpe|zone",
              "primary_target_value_text": "string (valeur lisible)",
              "secondary_target_value_text": "string|null",
              "warmup_summary": "string",
              "main_set_summary": "string",
              "cooldown_summary": "string",
              "workout_structure_json": "[{phase, description, duration_min, distance_m, target, rest}]",
              "structure_text": "string (détail de la séance sur plusieurs lignes)",
              "coach_note_short": "string|null",
              "carb_strategy_type": "string|null",
              "carb_before_g": "number|null",
              "carb_during_g_per_hour": "number|null",
              "carb_total_target_g": "number|null",
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
- Séance longue natation: 60-90min, 3000-4000m.
- Brick long (vélo+course): au moins 1 toutes les 2-3 semaines en phase spécifique.
- Semaines normales de développement: 8-14h.
- Semaines de récupération: 5-9h (pas en dessous de 5h).
- Première semaine du plan: partir du volume actuel de l'athlète ou 5-7h si inconnu.
- 5-7 séances/semaine en phase de développement, 4-6 en récupération.
- Natation: séances de 2500m à 4000m en développement, pas seulement 1000m technique.

PRIORISATION HEBDOMADAIRE IRONMAN (OBLIGATOIRE):
Le vélo est LA discipline structurante du plan Ironman. Chaque semaine DOIT être construite autour du vélo.

1. VÉLO = PILIER CENTRAL:
- Chaque semaine standard DOIT contenir au minimum:
  a) 1 séance vélo home trainer structurée en semaine (intervalles, sweet spot, force...)
  b) 1 seconde séance vélo utile si possible (HT ou extérieur)
  c) 1 sortie vélo longue le week-end dès que la disponibilité le permet
- Le home trainer est un levier central de performance, PAS un plan B.

2. WEEK-END = PRIORITÉ VÉLO LONG:
- Si l'athlète a du temps le week-end, la PRIORITÉ va au vélo long.
- Une sortie longue CAP ne doit JAMAIS remplacer la sortie longue vélo, sauf contrainte explicite.
- Si une seule séance longue est possible le week-end → choisir le vélo.

3. COURSE À PIED = PROTÉGÉE MAIS PAS SUR-PRIORISÉE:
- La CAP sert à entretenir la base, l'économie et la capacité à courir après le vélo.
- NE PAS empiler dans une même semaine:
  * une séance CAP de forte charge (long Z3, seuil prolongé)
  * ET une sortie longue CAP
  quand le volume vélo spécifique est insuffisant.
- Semaine standard CAP: 1 séance utile contrôlée + 1 footing court ou brick éventuel.
- Les longues CAP restent prudentes et ne doivent pas empiéter sur la qualité du vélo.

4. NATATION = MAINTIEN, PAS SUR-PRIORITÉ:
- 1 séance natation hebdomadaire OBLIGATOIRE.
- Une 2e séance natation possible seulement si elle n'entre pas en concurrence avec une séance vélo clé.

5. NUTRITION SUR SÉANCES VÉLO CLÉS:
- Les séances vélo importantes DOIVENT comporter une consigne glucidique/hydratation.
- La progression nutritionnelle doit être pensée en priorité sur les longues sorties vélo.

6. LOGIQUE DE RENDEMENT:
- En cas de doute entre deux constructions de semaine, choisir celle qui augmente le plus la probabilité de réussite sur Ironman.
- Favoriser le spécifique utile, limiter la fatigue non productive.
- Le plan ne doit PAS ressembler à un plan triathlon généraliste équilibré ; il DOIT refléter la priorité vélo.

7. RÈGLE DE VALIDATION AUTOMATIQUE:
Une semaine N'EST PAS correctement priorisée si:
- elle contient seulement 1 vélo structuré court
- mais 2 séances CAP significatives
- et aucune sortie vélo longue alors qu'une disponibilité week-end existe.
Dans ce cas, corrige en:
- remplaçant la sortie longue CAP par un vélo long
- réduisant la charge CAP
- maintenant la natation en soutien.`;
  }

  if (format.includes("half") || format.includes("70.3") || format.includes("mi")) {
    return `REPÈRES VOLUME HALF-IRONMAN / 70.3:
- Volume hebdo peak: 8-12h.
- Sortie longue vélo peak: 3h-4h30.
- Sortie longue course peak: 1h30-2h15.
- Séance longue natation: 50-75min, 2500-3500m.
- Semaines normales de développement: 6-10h.
- Semaines de récupération: 4-6h.
- Première semaine: partir du volume actuel ou 4-6h si inconnu.
- 5-6 séances/semaine en développement.
- Natation: séances de 2000m à 3500m, pas seulement technique légère.`;
  }

  if (format.includes("olympic") || format.includes("m") || format.includes("cd") || format.includes("distance olympique")) {
    return `REPÈRES VOLUME TRIATHLON OLYMPIQUE:
- Volume hebdo peak: 6-9h.
- Sortie longue vélo peak: 2h-3h.
- Sortie longue course peak: 1h15-1h45.
- Séance longue natation: 45-60min, 2000-3000m.
- Semaines normales: 5-8h.
- Semaines de récupération: 3-5h.
- 4-6 séances/semaine.`;
  }

  if (format.includes("sprint") || format.includes("xs") || format.includes("s")) {
    return `REPÈRES VOLUME TRIATHLON SPRINT:
- Volume hebdo peak: 4-7h.
- Sortie longue vélo peak: 1h30-2h30.
- Sortie longue course peak: 50min-1h15.
- Séance natation: 1500-2500m.
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
