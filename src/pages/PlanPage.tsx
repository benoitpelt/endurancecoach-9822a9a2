import { useState, useEffect } from "react";
import TrajectoryWidget from "@/components/TrajectoryWidget";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Calendar, Target, ChevronRight, Layers, Sparkles, AlertTriangle, Info, Activity, Dumbbell, RotateCcw, RefreshCw, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  created_at: string;
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

type Regeneration = {
  id: string;
  source_plan_id: string;
  generated_plan_id: string;
  reason: string | null;
  restored_at: string | null;
  created_at: string;
};

export default function PlanPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [recalibrating, setRecalibrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [goal, setGoal] = useState<any>(null);
  const [generationNotes, setGenerationNotes] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState(true);
  const [trajectoryData, setTrajectoryData] = useState<any>(null);
  const [trajectoryLoading, setTrajectoryLoading] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [lastRegeneration, setLastRegeneration] = useState<Regeneration | null>(null);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadPlan();
    checkProfileCompleteness();
    loadTrajectory();
  }, [user]);

  const loadTrajectory = async () => {
    if (!user) return;
    setTrajectoryLoading(true);
    try {
      const { data: goalData } = await supabase
        .from("race_goals")
        .select("id, target_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (goalData?.target_date) {
        setDaysRemaining(Math.ceil((new Date(goalData.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      }

      if (goalData) {
        const { data: snapshot } = await supabase
          .from("goal_trajectory_snapshots")
          .select("trajectory_status, realism_score_percent, summary_short, supporting_points, weakening_points, suggests_plan_review")
          .eq("user_id", user.id)
          .eq("goal_id", goalData.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setTrajectoryData(snapshot);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTrajectoryLoading(false);
    }
  };

  const checkProfileCompleteness = async () => {
    const [{ data: prof }, { data: goalData }] = await Promise.all([
      supabase.from("athlete_profiles").select("onboarding_completed").eq("user_id", user!.id).maybeSingle(),
      supabase.from("race_goals").select("id").eq("user_id", user!.id).limit(1).maybeSingle(),
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

      // Load last restorable regeneration
      const { data: regens } = await supabase
        .from("plan_regenerations" as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("generated_plan_id", currentPlan.id)
        .is("restored_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (regens && regens.length > 0) {
        // Check if source plan still exists as archived
        const regen = regens[0] as any;
        const { data: sourcePlan } = await supabase
          .from("training_plans")
          .select("id, status")
          .eq("id", regen.source_plan_id)
          .eq("status", "archived")
          .maybeSingle();
        
        if (sourcePlan) {
          setLastRegeneration(regen as Regeneration);
        } else {
          setLastRegeneration(null);
        }
      } else {
        setLastRegeneration(null);
      }

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

  const recalibrateWorkouts = async () => {
    if (!user) return;
    try {
      setRecalibrating(true);
      setError(null);

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Session expirée.");

      const res = await supabase.functions.invoke("recalibrate-workouts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.error) {
        const msg = typeof res.error === "object" && "message" in res.error
          ? (res.error as any).message : String(res.error);
        throw new Error(msg);
      }

      const data = res.data;
      if (data?.error) throw new Error(data.error);

      toast.success(data?.message || "Séances recalibrées !");
      await loadPlan();
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "Erreur lors du recalibrage.";
      setError(msg);
      toast.error(msg);
    } finally {
      setRecalibrating(false);
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
          ? (res.error as any).message : String(res.error);
        throw new Error(msg);
      }

      const data = res.data;
      if (data?.error) throw new Error(data.error);

      if (data?.generation_notes) {
        setGenerationNotes(data.generation_notes);
      }

      toast.success("Plan régénéré avec succès !");
      await loadPlan();
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "Erreur lors de la génération du plan.";
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
      setShowRegenerateDialog(false);
    }
  };

  const restorePreviousPlan = async () => {
    if (!user || !lastRegeneration || !plan) return;
    try {
      setRestoring(true);

      // Archive current plan
      await supabase
        .from("training_plans")
        .update({ status: "archived" } as any)
        .eq("id", plan.id);

      // Restore source plan
      await supabase
        .from("training_plans")
        .update({ status: "active" } as any)
        .eq("id", lastRegeneration.source_plan_id);

      // Mark regeneration as restored
      await supabase
        .from("plan_regenerations" as any)
        .update({ restored_at: new Date().toISOString() } as any)
        .eq("id", lastRegeneration.id);

      toast.success("Plan précédent restauré avec succès !");
      await loadPlan();
      await loadTrajectory();
    } catch (e: any) {
      console.error(e);
      toast.error("Erreur lors de la restauration.");
    } finally {
      setRestoring(false);
      setShowRestoreDialog(false);
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
            </p>

            {!profileComplete && (
              <div className="flex items-start gap-3 bg-warning/10 border border-warning/30 rounded-lg p-4 text-left max-w-md mx-auto">
                <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-warning">Profil incomplet</p>
                  <p className="text-muted-foreground">Le plan sera généré avec des hypothèses prudentes.</p>
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
              <Button onClick={generatePlan} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "Génération en cours…" : "Générer mon plan"}
              </Button>
              <Button variant="outline" onClick={() => navigate("/strava")} className="gap-2">
                <Activity className="h-4 w-4" /> Connecter Strava
              </Button>
            </div>
            {generating && (
              <p className="text-xs text-muted-foreground animate-pulse">
                Analyse de ton profil et construction du plan…
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

        {/* Restore banner */}
        {lastRegeneration && (
          <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-lg p-4">
            <RotateCcw className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="text-sm">
                <p className="font-medium">Ce plan a été régénéré le {formatDate(lastRegeneration.created_at.split("T")[0])}</p>
                <p className="text-muted-foreground">Le plan précédent est encore disponible. Tu peux le restaurer si cette régénération ne te convient pas.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRestoreDialog(true)}
                disabled={restoring}
                className="gap-2"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restaurer le plan précédent
              </Button>
            </div>
          </div>
        )}

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

        {/* Trajectory widget */}
        <TrajectoryWidget trajectory={trajectoryData} daysRemaining={daysRemaining} loading={trajectoryLoading} />

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

        {/* Actions — Recalibrate is primary, Regenerate is secondary */}
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
            size="sm"
            onClick={recalibrateWorkouts}
            disabled={recalibrating || generating}
            className="gap-2"
          >
            {recalibrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {recalibrating ? "Recalibrage…" : "Recalibrer mes séances"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRegenerateDialog(true)}
            disabled={generating || recalibrating}
            className="gap-2 text-muted-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
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

      {/* Full regeneration confirmation dialog */}
      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Régénérer complètement le plan ?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-left">
              <p>
                Cette action va <strong>recréer entièrement la structure</strong> de ton plan (blocs, semaines et séances) à partir d'aujourd'hui.
              </p>
              <p>
                Le plan actuel sera archivé et pourra être restauré si besoin.
              </p>
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium">💡 Tu voulais peut-être juste recalibrer ?</p>
                <p>Pour ajuster les séances futures sans toucher à la structure du plan, utilise plutôt <strong>"Recalibrer mes séances"</strong>.</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Les activités déjà réalisées et les analyses ne seront pas perdues.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={generatePlan}
              disabled={generating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Oui, régénérer le plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore confirmation dialog */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurer le plan précédent ?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <p>Le plan actuel sera archivé et le plan précédent sera remis en place.</p>
              <p className="text-xs text-muted-foreground">
                Tes activités réalisées et analyses ne seront pas affectées.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={restorePreviousPlan} disabled={restoring}>
              {restoring ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Restaurer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
