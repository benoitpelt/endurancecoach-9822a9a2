import { useState, useEffect } from "react";
import TrajectoryWidget from "@/components/TrajectoryWidget";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Calendar, Target, ChevronRight, Layers, Sparkles, AlertTriangle, Info, Activity, Dumbbell } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  active: "Actif",
  archived: "Archivé",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  archived: "bg-muted text-muted-foreground",
};

const WEEK_TYPE_LABELS: Record<string, string> = {
  normal: "Normale",
  recovery: "Récupération",
  taper: "Affûtage",
  race_week: "Semaine de course",
};

const WEEK_TYPE_COLORS: Record<string, string> = {
  normal: "border-l-primary",
  recovery: "border-l-accent",
  taper: "border-l-warning",
  race_week: "border-l-destructive",
};

const SPORT_EMOJI: Record<string, string> = {
  swim: "🏊",
  bike: "🚴",
  run: "🏃",
  strength: "💪",
  mobility: "🧘",
  rest: "😴",
};

type Plan = {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  goal_id: string | null;
};

type Block = {
  id: string;
  name: string;
  block_order: number;
  start_date: string | null;
  end_date: string | null;
  focus: string | null;
  notes: string | null;
};

type Week = {
  id: string;
  block_id: string;
  week_number: number;
  week_type: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
};

type Workout = {
  id: string;
  week_id: string;
  sport_type: string;
  workout_priority: string;
  scheduled_date: string | null;
  duration_target_minutes: number | null;
};

export default function PlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [goal, setGoal] = useState<any>(null);
  const [generationNotes, setGenerationNotes] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadPlan();
    checkProfileCompleteness();
  }, [user]);

  const checkProfileCompleteness = async () => {
    const [{ data: prof }, { data: goalData }, { data: enriched }] = await Promise.all([
      supabase.from("athlete_profiles").select("onboarding_completed").eq("user_id", user!.id).maybeSingle(),
      supabase.from("race_goals").select("id").eq("user_id", user!.id).limit(1).maybeSingle(),
      supabase.from("athlete_enriched_profiles").select("enriched_onboarding_completed").eq("user_id", user!.id).maybeSingle(),
    ]);
    setProfileComplete(!!(prof?.onboarding_completed && goalData));
  };

  const loadPlan = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: plans, error: planErr } = await supabase
        .from("training_plans")
        .select("*")
        .eq("user_id", user!.id)
        .in("status", ["active", "draft"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (planErr) throw planErr;
      if (!plans || plans.length === 0) {
        setLoading(false);
        return;
      }

      const currentPlan = plans[0] as Plan;
      setPlan(currentPlan);

      if (currentPlan.goal_id) {
        const { data: goalData } = await supabase
          .from("race_goals")
          .select("*")
          .eq("id", currentPlan.goal_id)
          .maybeSingle();
        setGoal(goalData);
      }

      const { data: blocksData } = await supabase
        .from("training_blocks")
        .select("*")
        .eq("plan_id", currentPlan.id)
        .order("block_order");

      const loadedBlocks = (blocksData || []) as Block[];
      setBlocks(loadedBlocks);

      if (loadedBlocks.length > 0) {
        const blockIds = loadedBlocks.map((b) => b.id);

        const { data: weeksData } = await supabase
          .from("training_weeks")
          .select("*")
          .in("block_id", blockIds)
          .order("week_number");

        const loadedWeeks = (weeksData || []) as Week[];
        setWeeks(loadedWeeks);

        if (loadedWeeks.length > 0) {
          const weekIds = loadedWeeks.map((w) => w.id);
          const { data: workoutsData } = await supabase
            .from("planned_workouts")
            .select("id, week_id, sport_type, workout_priority, scheduled_date, duration_target_minutes")
            .in("week_id", weekIds)
            .order("scheduled_date");

          setWorkouts((workoutsData || []) as Workout[]);
        }
      }
    } catch {
      setError("Impossible de charger le plan. Réessaie plus tard.");
    } finally {
      setLoading(false);
    }
  };

  const generatePlan = async () => {
    if (!user) return;
    try {
      setGenerating(true);
      setError(null);
      setGenerationNotes(null);

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Session expirée.");

      const res = await supabase.functions.invoke("generate-training-plan", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.error) {
        const msg = typeof res.error === "object" && "message" in res.error
          ? (res.error as any).message
          : String(res.error);
        throw new Error(msg);
      }

      const data = res.data;
      if (data?.error) throw new Error(data.error);

      if (data?.generation_notes) {
        setGenerationNotes(data.generation_notes);
      }

      toast.success("Plan généré avec succès !");
      await loadPlan();
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "Erreur lors de la génération du plan.";
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!plan && !generating) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <Button variant="ghost" onClick={() => navigate("/summary")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
          <div className="bg-card rounded-xl shadow-card p-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-gradient-subtle flex items-center justify-center">
              <Layers className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-heading font-bold">Générer ton plan</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Ton plan d'entraînement sera construit à partir de ton profil, ton objectif et tes disponibilités. 
              Il sera structuré en blocs, semaines et séances avec des priorités claires.
            </p>

            {!profileComplete && (
              <div className="flex items-start gap-3 bg-warning/10 border border-warning/30 rounded-lg p-4 text-left max-w-md mx-auto">
                <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-warning">Profil incomplet</p>
                  <p className="text-muted-foreground">Le plan sera généré avec des hypothèses prudentes. Tu peux d'abord compléter ton profil pour un plan plus personnalisé.</p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-left max-w-md mx-auto">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button
                onClick={generatePlan}
                disabled={generating}
                className="gap-2"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "Génération en cours…" : "Générer mon plan"}
              </Button>
              <Button variant="outline" onClick={() => navigate("/strava")} className="gap-2">
                <Activity className="h-4 w-4" />
                Connecter Strava
              </Button>
              <Button variant="ghost" onClick={() => navigate("/summary")}>
                Compléter mon profil
              </Button>
            </div>
            {generating && (
              <p className="text-xs text-muted-foreground animate-pulse">
                Analyse de ton profil et construction du plan… Cela peut prendre quelques secondes.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground text-center">Génération de ton plan en cours…</p>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          Le coach analyse ton profil, ton objectif et tes disponibilités pour construire un plan personnalisé.
        </p>
      </div>
    );
  }

  if (error && !plan) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" onClick={loadPlan}>Réessayer</Button>
        </div>
      </div>
    );
  }

  if (!plan) return null;

  const weeksByBlock = (blockId: string) => weeks.filter((w) => w.block_id === blockId);
  const workoutsByWeek = (weekId: string) => workouts.filter((w) => w.week_id === weekId);

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try {
      return format(new Date(d), "d MMM yyyy", { locale: fr });
    } catch {
      return d;
    }
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/summary")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>

        {/* Plan header */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-heading font-bold">{plan.name}</h1>
              {goal && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Target className="h-3.5 w-3.5" />
                  {goal.event_name || goal.format || goal.goal_type}
                  {goal.target_date && ` — ${formatDate(goal.target_date)}`}
                </p>
              )}
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[plan.status] || STATUS_COLORS.draft}`}>
              {STATUS_LABELS[plan.status] || plan.status}
            </span>
          </div>
          {(plan.start_date || plan.end_date) && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(plan.start_date)} → {formatDate(plan.end_date)}
            </p>
          )}
          {plan.notes && (
            <div className="bg-gradient-subtle rounded-lg p-4 mt-2">
              <div className="flex items-center gap-2 mb-1">
                <Info className="h-4 w-4 text-primary" />
                <span className="text-sm font-heading font-semibold">Logique du plan</span>
              </div>
              <p className="text-sm text-muted-foreground">{plan.notes}</p>
            </div>
          )}
        </div>

        {/* Generation notes */}
        {generationNotes && (
          <div className="flex items-start gap-3 bg-warning/10 border border-warning/30 rounded-lg p-4">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-warning">Note de génération</p>
              <p className="text-muted-foreground">{generationNotes}</p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/activities")}
            className="gap-2"
          >
            <Dumbbell className="h-3.5 w-3.5" />
            Mes activités
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/strava")}
            className="gap-2"
          >
            <Activity className="h-3.5 w-3.5" />
            Strava
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={generatePlan}
            disabled={generating}
            className="gap-2"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Régénérer le plan
          </Button>
        </div>

        {/* Blocks */}
        {blocks.length === 0 ? (
          <div className="bg-card rounded-xl shadow-card p-6 text-center space-y-2">
            <p className="text-muted-foreground">Ce plan ne contient pas encore de blocs.</p>
          </div>
        ) : (
          blocks.map((block) => {
            const bWeeks = weeksByBlock(block.id);
            return (
              <div key={block.id} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1 rounded-full bg-gradient-hero" />
                  <div>
                    <h2 className="font-heading font-semibold text-lg">{block.name}</h2>
                    {block.focus && <p className="text-xs text-muted-foreground">{block.focus}</p>}
                  </div>
                  {(block.start_date || block.end_date) && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDate(block.start_date)} → {formatDate(block.end_date)}
                    </span>
                  )}
                </div>

                {bWeeks.length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-5">Aucune semaine dans ce bloc.</p>
                ) : (
                  <div className="space-y-2">
                    {bWeeks.map((week) => {
                      const wWorkouts = workoutsByWeek(week.id);
                      const sportCounts: Record<string, number> = {};
                      let totalMin = 0;
                      wWorkouts.forEach((wo) => {
                        sportCounts[wo.sport_type] = (sportCounts[wo.sport_type] || 0) + 1;
                        totalMin += wo.duration_target_minutes || 0;
                      });

                      return (
                        <button
                          key={week.id}
                          onClick={() => navigate(`/plan/week/${week.id}`)}
                          className={`w-full text-left bg-card rounded-lg shadow-card p-4 border-l-4 ${WEEK_TYPE_COLORS[week.week_type] || WEEK_TYPE_COLORS.normal} hover:shadow-elevated transition-shadow`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-heading font-semibold text-sm">Semaine {week.week_number}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                  {WEEK_TYPE_LABELS[week.week_type] || week.week_type}
                                </span>
                              </div>
                              {(week.start_date || week.end_date) && (
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(week.start_date)} → {formatDate(week.end_date)}
                                </p>
                              )}
                              {wWorkouts.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {wWorkouts.length} séance{wWorkouts.length > 1 ? "s" : ""}
                                  {totalMin > 0 && ` · ${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, "0")}`}
                                  {Object.keys(sportCounts).length > 0 && ` · ${Object.entries(sportCounts).map(([s, c]) => `${c} ${SPORT_EMOJI[s] || s}`).join(", ")}`}
                                </p>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
