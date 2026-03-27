import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Calendar, Target, ChevronRight, Layers } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

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
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [goal, setGoal] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    loadPlan();
  }, [user]);

  const loadPlan = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get most recent plan (active first, then draft)
      const { data: plans, error: planErr } = await supabase
        .from("training_plans")
        .select("*")
        .eq("user_id", user!.id)
        .order("status", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(1);

      if (planErr) throw planErr;
      if (!plans || plans.length === 0) {
        setLoading(false);
        return;
      }

      const currentPlan = plans[0] as Plan;
      setPlan(currentPlan);

      // Load goal if linked
      if (currentPlan.goal_id) {
        const { data: goalData } = await supabase
          .from("race_goals")
          .select("*")
          .eq("id", currentPlan.goal_id)
          .maybeSingle();
        setGoal(goalData);
      }

      // Load blocks
      const { data: blocksData } = await supabase
        .from("training_blocks")
        .select("*")
        .eq("plan_id", currentPlan.id)
        .order("block_order");

      const loadedBlocks = (blocksData || []) as Block[];
      setBlocks(loadedBlocks);

      if (loadedBlocks.length > 0) {
        const blockIds = loadedBlocks.map((b) => b.id);

        // Load weeks
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
    } catch (e: any) {
      setError("Impossible de charger le plan. Réessaie plus tard.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" onClick={loadPlan}>Réessayer</Button>
        </div>
      </div>
    );
  }

  // Empty state - no plan
  if (!plan) {
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
            <h1 className="text-2xl font-heading font-bold">Pas encore de plan</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Ton plan d'entraînement sera bientôt disponible. Complete d'abord ton profil et ton objectif pour préparer la génération.
            </p>
            <Button onClick={() => navigate("/summary")}>Voir mon profil</Button>
          </div>
        </div>
      </div>
    );
  }

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
          {plan.notes && <p className="text-sm text-muted-foreground">{plan.notes}</p>}
        </div>

        {/* Blocks */}
        {blocks.length === 0 ? (
          <div className="bg-card rounded-xl shadow-card p-6 text-center space-y-2">
            <p className="text-muted-foreground">Ce plan ne contient pas encore de blocs.</p>
            <p className="text-xs text-muted-foreground">La structure sera générée dans une prochaine étape.</p>
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
                                  {totalMin > 0 && ` · ${Math.round(totalMin / 60)}h${String(totalMin % 60).padStart(2, "0")}`}
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

const SPORT_EMOJI: Record<string, string> = {
  swim: "🏊",
  bike: "🚴",
  run: "🏃",
  strength: "💪",
  mobility: "🧘",
  rest: "😴",
};
