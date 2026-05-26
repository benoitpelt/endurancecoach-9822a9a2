import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// CTL = exponentially weighted average TSS over 42 days
// ATL = over 7 days. TSB = CTL - ATL.
function computeLoad(activities: Array<{ start_date: string; tss: number }>) {
  const now = Date.now();
  const dayMs = 86400000;
  let ctl = 0;
  let atl = 0;
  const ctlK = 1 - Math.exp(-1 / 42);
  const atlK = 1 - Math.exp(-1 / 7);
  // Build per-day TSS for the last 60 days, then iterate forward
  const days: number[] = new Array(60).fill(0);
  for (const a of activities) {
    if (!a.start_date) continue;
    const ageDays = Math.floor((now - new Date(a.start_date).getTime()) / dayMs);
    if (ageDays < 0 || ageDays >= 60) continue;
    days[59 - ageDays] += a.tss || 0;
  }
  for (const tss of days) {
    ctl = ctl + (tss - ctl) * ctlK;
    atl = atl + (tss - atl) * atlK;
  }
  return {
    ctl: Math.round(ctl),
    atl: Math.round(atl),
    tsb: Math.round(ctl - atl),
  };
}

// Rough TSS estimate when not provided
function estimateTSS(a: any): number {
  const seconds = a.moving_time_seconds || a.duration_seconds || 0;
  if (!seconds) return 0;
  const hours = seconds / 3600;
  // Use HR-based IF estimate if avg HR available, else conservative 0.65
  let intensity = 0.65;
  if (a.avg_heartrate) {
    intensity = Math.max(0.4, Math.min(1.0, a.avg_heartrate / 175));
  }
  return Math.round(hours * intensity * intensity * 100);
}

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
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY manquante");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Non autorisé");

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "chat";

    // ===== Context loading =====
    if (action === "context") {
      const [planRes, goalRes, actsRes] = await Promise.all([
        supabase
          .from("training_plans")
          .select(
            "id, name, status, start_date, end_date, training_blocks(id, name, focus, start_date, end_date, training_weeks(id, week_number, week_type, start_date, end_date, planned_workouts(id, sport_type, scheduled_date, session_goal, target_summary_label, duration_target_minutes, distance_target_km, intensity_zone_label, structure_text, status, workout_priority)))",
          )
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("race_goals")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("imported_activities")
          .select(
            "id, name, sport_type_normalized, start_date, duration_seconds, moving_time_seconds, distance_meters, avg_heartrate, avg_power",
          )
          .eq("user_id", user.id)
          .order("start_date", { ascending: false })
          .limit(30),
      ]);

      const activities = (actsRes.data ?? []).map((a) => ({
        ...a,
        tss: estimateTSS(a),
      }));
      const load = computeLoad(
        activities.map((a) => ({ start_date: a.start_date as string, tss: a.tss })),
      );

      return new Response(
        JSON.stringify({
          plan: planRes.data,
          goal: goalRes.data,
          activities,
          load,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ===== Chat =====
    const messages: ChatMessage[] = body.messages ?? [];
    const context = body.context ?? {};

    const systemPrompt = `Tu es un coach triathlon expert. Tu reçois le contexte complet de l'athlète : son plan d'entraînement, son objectif de course, sa charge et fatigue actuelles (CTL/ATL/TSB), et ses 30 dernières activités Strava.

L'athlète te décrit sa situation du jour (forme, disponibilité, contraintes). Tu dois produire une séance adaptée, structurée exactement ainsi :

**SÉANCE DU JOUR — [TYPE] — [DURÉE]**

🔥 Échauffement (X min)
- [détail]

🎯 Bloc principal
- [bloc 1 : durée, zone, consigne]
- [bloc 2 : durée, zone, consigne]
- (etc.)

🧘 Retour au calme (X min)
- [détail]

📝 Pourquoi cette séance : [justification courte en 2-3 phrases maximum, liée au contexte de charge/fatigue et au plan]

Ne produis rien d'autre que cette structure. Pas de blabla avant ou après.

Contexte athlète :

[PLAN] : ${JSON.stringify(context.plan ?? null)}

[OBJECTIF] : ${JSON.stringify(context.goal ?? null)}

[CHARGE/FATIGUE] : ${JSON.stringify(context.load ?? null)}

[ACTIVITÉS 30J] : ${JSON.stringify(context.activities ?? [])}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!aiRes.ok) {
      const errTxt = await aiRes.text();
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "Trop de requêtes, réessaie dans un instant." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "Crédits IA épuisés." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`AI error ${aiRes.status}: ${errTxt}`);
    }

    const aiData = await aiRes.json();
    const reply = aiData.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
