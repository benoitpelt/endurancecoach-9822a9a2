import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, CheckCircle2, AlertTriangle, HelpCircle, Dumbbell, Clock, Ruler, Zap, Heart, Mountain, Target, ChevronDown, ChevronUp, Send, MessageSquare, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const SPORT_LABELS: Record<string, string> = {
  swim: "Natation", bike: "Vélo", run: "Course à pied",
  strength: "Renforcement", mobility: "Mobilité", walk: "Marche",
};
const SPORT_EMOJI: Record<string, string> = {
  swim: "🏊", bike: "🚴", run: "🏃", strength: "💪", mobility: "🧘", walk: "🚶",
};

const CONFORMITY_CONFIG: Record<string, { label: string; icon: any; classes: string; bgClasses: string }> = {
  conform: { label: "Séance conforme", icon: CheckCircle2, classes: "text-accent", bgClasses: "bg-accent/10 border-accent/30" },
  partial: { label: "Partiellement conforme", icon: AlertTriangle, classes: "text-warning", bgClasses: "bg-warning/10 border-warning/30" },
  non_conform: { label: "Non conforme", icon: AlertTriangle, classes: "text-destructive", bgClasses: "bg-destructive/10 border-destructive/30" },
  free_workout: { label: "Séance libre", icon: Dumbbell, classes: "text-primary", bgClasses: "bg-primary/10 border-primary/30" },
  pending: { label: "En attente d'analyse", icon: HelpCircle, classes: "text-muted-foreground", bgClasses: "bg-muted border-border" },
  ignored: { label: "Non exploité", icon: HelpCircle, classes: "text-muted-foreground", bgClasses: "bg-muted border-border" },
};

const RPE_LABELS: Record<number, string> = {
  1: "Très facile", 2: "Facile", 3: "Léger", 4: "Modéré", 5: "Moyen",
  6: "Soutenu", 7: "Difficile", 8: "Très difficile", 9: "Maximal", 10: "Épuisant",
};

const FATIGUE_LABELS: Record<number, string> = {
  1: "Frais", 2: "Légèrement fatigué", 3: "Fatigué", 4: "Très fatigué", 5: "Épuisé",
};

export default function CompletedWorkoutDetailPage() {
  const { id: workoutId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [workout, setWorkout] = useState<any>(null);
  const [planned, setPlanned] = useState<any>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [detailedAnalysis, setDetailedAnalysis] = useState<any>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [showDetailed, setShowDetailed] = useState(false);
  const [activityDetails, setActivityDetails] = useState<{ splits_metric: any[] | null; laps: any[] | null; details_fetched_at: string | null } | null>(null);
  const [showSplits, setShowSplits] = useState(true);
  const [showLaps, setShowLaps] = useState(false);
  
  
  // Feedback form
  const [showFeedback, setShowFeedback] = useState(false);
  const [rpe, setRpe] = useState<number>(5);
  const [fatigue, setFatigue] = useState<number>(3);
  const [comment, setComment] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);

  useEffect(() => {
    if (!user || !workoutId) return;
    loadWorkout();
  }, [user, workoutId]);

  const loadWorkout = async () => {
    try {
      setLoading(true);

      const { data: cw, error } = await supabase
        .from("completed_workouts")
        .select("*")
        .eq("id", workoutId!)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) throw error;
      if (!cw) { setLoading(false); return; }
      setWorkout(cw);

      // Load planned workout and feedback in parallel
      if (cw.planned_workout_id) {
        const { data: pw } = await supabase.from("planned_workouts").select("*").eq("id", cw.planned_workout_id).maybeSingle();
        setPlanned(pw);
      }

      const { data: fb } = await supabase.from("completed_workout_feedback").select("*").eq("completed_workout_id", workoutId!).maybeSingle();
      if (fb) {
        setFeedback(fb);
        setRpe(fb.rpe || 5);
        setFatigue(fb.fatigue_after || 3);
        setComment(fb.comment_text || "");
      }

      const { data: da } = await supabase.from("workout_analyses").select("*")
        .eq("completed_workout_id", workoutId!)
        .eq("analysis_type", "detailed")
        .maybeSingle();
      if (da) setDetailedAnalysis(da);

      // Load splits & laps from imported_activities
      if (cw.imported_activity_id) {
        const { data: ia } = await supabase
          .from("imported_activities")
          .select("splits_metric, laps, details_fetched_at")
          .eq("id", cw.imported_activity_id)
          .maybeSingle();
        if (ia) setActivityDetails(ia as any);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const requestDetailedAnalysis = async () => {
    try {
      setLoadingAnalysis(true);
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Session expirée.");

      const res = await supabase.functions.invoke("analyze-workout", {
        headers: { Authorization: `Bearer ${token}` },
        body: { completed_workout_id: workoutId },
      });

      if (res.error || res.data?.error) throw new Error(res.data?.error || "Erreur d'analyse.");
      setDetailedAnalysis(res.data.analysis);
      setShowDetailed(true);
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'analyse.");
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const saveFeedback = async () => {
    try {
      setSavingFeedback(true);
      const feedbackData = {
        user_id: user!.id,
        completed_workout_id: workoutId!,
        rpe,
        fatigue_after: fatigue,
        comment_text: comment || null,
      };

      if (feedback) {
        await supabase.from("completed_workout_feedback").update(feedbackData).eq("id", feedback.id);
      } else {
        const { data } = await supabase.from("completed_workout_feedback").insert(feedbackData).select().single();
        setFeedback(data);
      }
      toast.success("Ressenti enregistré !");
      setShowFeedback(false);
    } catch (e: any) {
      toast.error("Erreur lors de la sauvegarde.");
    } finally {
      setSavingFeedback(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "EEEE d MMMM yyyy", { locale: fr }); } catch { return d; }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!workout) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => navigate("/activities")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
          <p className="text-destructive text-center">Séance introuvable.</p>
        </div>
      </div>
    );
  }

  const conf = CONFORMITY_CONFIG[workout.conformity_status] || CONFORMITY_CONFIG.pending;
  const ConfIcon = conf.icon;
  const actualDurMin = workout.moving_time_seconds ? Math.round(workout.moving_time_seconds / 60) : null;
  const actualDistKm = workout.distance_meters ? Math.round(Number(workout.distance_meters) / 1000 * 10) / 10 : null;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/activities")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Retour aux activités
        </Button>

        {/* Header */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
          <div className="flex items-start gap-4">
            <span className="text-4xl">{SPORT_EMOJI[workout.sport_type] || "🏋️"}</span>
            <div className="space-y-1 flex-1">
              <h1 className="text-2xl font-heading font-bold">
                {workout.activity_name || SPORT_LABELS[workout.sport_type] || workout.sport_type}
              </h1>
              <p className="text-sm text-muted-foreground capitalize">{formatDate(workout.start_date)}</p>
            </div>
          </div>

          {/* Conformity badge */}
          <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 ${conf.bgClasses}`}>
            <ConfIcon className={`h-4 w-4 ${conf.classes}`} />
            <span className={`text-sm font-medium ${conf.classes}`}>{conf.label}</span>
            {workout.requires_adjustment_review && (
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30">
                ⚠️ Vigilance
              </span>
            )}
          </div>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {actualDurMin && <MetricCard icon={Clock} label="Durée" value={actualDurMin < 60 ? `${actualDurMin} min` : `${Math.floor(actualDurMin / 60)}h${String(actualDurMin % 60).padStart(2, "0")}`} />}
          {actualDistKm && <MetricCard icon={Ruler} label="Distance" value={`${actualDistKm} km`} />}
          {workout.avg_heartrate && <MetricCard icon={Heart} label="FC moyenne" value={`${Math.round(Number(workout.avg_heartrate))} bpm`} />}
          {workout.elevation_gain_meters && <MetricCard icon={Mountain} label="Dénivelé" value={`${Math.round(Number(workout.elevation_gain_meters))} m`} />}
          {workout.avg_power && <MetricCard icon={Zap} label="Puissance moy." value={`${Math.round(Number(workout.avg_power))} W`} />}
          {workout.calories && <MetricCard icon={Target} label="Calories" value={`${Math.round(Number(workout.calories))}`} />}
        </div>

        {/* Splits & laps */}
        {activityDetails && ((activityDetails.splits_metric?.length ?? 0) > 0 || (activityDetails.laps?.length ?? 0) > 0) && (
          <div className="bg-card rounded-xl shadow-card overflow-hidden">
            <div className="flex items-center border-b border-border">
              {(activityDetails.splits_metric?.length ?? 0) > 0 && (
                <button
                  onClick={() => { setShowSplits(true); setShowLaps(false); }}
                  className={`flex-1 px-4 py-3 text-sm font-medium ${showSplits ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
                >
                  Splits / km ({activityDetails.splits_metric!.length})
                </button>
              )}
              {(activityDetails.laps?.length ?? 0) > 0 && (
                <button
                  onClick={() => { setShowLaps(true); setShowSplits(false); }}
                  className={`flex-1 px-4 py-3 text-sm font-medium ${showLaps ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
                >
                  Laps ({activityDetails.laps!.length})
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              {showSplits && activityDetails.splits_metric && (
                <SplitsTable splits={activityDetails.splits_metric} sport={workout.sport_type} />
              )}
              {showLaps && activityDetails.laps && (
                <LapsTable laps={activityDetails.laps} sport={workout.sport_type} />
              )}
            </div>
          </div>
        )}
        {workout.imported_activity_id && activityDetails && !activityDetails.details_fetched_at && (
          <div className="bg-muted/40 border border-border rounded-xl p-4 text-xs text-muted-foreground">
            Détails km/lap non encore importés. Lance "Enrichir le détail des activités" depuis la page Strava.
          </div>
        )}

        {/* Short analysis */}
        {workout.short_analysis && (
          <div className="bg-gradient-subtle rounded-xl p-5 space-y-2">
            <h2 className="font-heading font-semibold text-sm">Analyse rapide</h2>
            <p className="text-sm text-foreground">{workout.short_analysis}</p>
          </div>
        )}

        {/* Planned workout comparison */}
        {planned && (
          <div className="bg-card rounded-xl shadow-card p-5 space-y-3">
            <h2 className="font-heading font-semibold">Séance prévue</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {planned.duration_target_minutes && (
                <div>
                  <span className="text-muted-foreground text-xs">Durée prévue</span>
                  <p className="font-medium">{planned.duration_target_minutes} min</p>
                </div>
              )}
              {planned.distance_target_km && (
                <div>
                  <span className="text-muted-foreground text-xs">Distance prévue</span>
                  <p className="font-medium">{Number(planned.distance_target_km)} km</p>
                </div>
              )}
              {planned.intensity_zone_label && (
                <div>
                  <span className="text-muted-foreground text-xs">Intensité</span>
                  <p className="font-medium">{planned.intensity_zone_label}</p>
                </div>
              )}
              {planned.workout_priority && (
                <div>
                  <span className="text-muted-foreground text-xs">Priorité</span>
                  <p className="font-medium capitalize">{planned.workout_priority === "key" ? "Séance clé" : planned.workout_priority}</p>
                </div>
              )}
            </div>
            {planned.session_goal && (
              <div>
                <span className="text-muted-foreground text-xs">Objectif</span>
                <p className="text-sm">{planned.session_goal}</p>
              </div>
            )}
          </div>
        )}

        {/* Detailed analysis section */}
        <div className="bg-card rounded-xl shadow-card overflow-hidden">
          <button
            onClick={() => {
              if (!detailedAnalysis && !loadingAnalysis) {
                requestDetailedAnalysis();
              } else {
                setShowDetailed(!showDetailed);
              }
            }}
            className="w-full flex items-center justify-between p-5 text-left"
          >
            <h2 className="font-heading font-semibold">Analyse détaillée</h2>
            {loadingAnalysis ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              showDetailed ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showDetailed && detailedAnalysis && (
            <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
              {detailedAnalysis.planned_summary && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Prévu</span>
                  <p className="text-sm mt-1">{detailedAnalysis.planned_summary}</p>
                </div>
              )}
              {detailedAnalysis.actual_summary && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Réalisé</span>
                  <p className="text-sm mt-1">{detailedAnalysis.actual_summary}</p>
                </div>
              )}
              {detailedAnalysis.comparison_text && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Comparaison</span>
                  <p className="text-sm mt-1">{detailedAnalysis.comparison_text}</p>
                </div>
              )}
              {detailedAnalysis.interpretation_text && (
                <div className="bg-gradient-subtle rounded-lg p-4">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Interprétation</span>
                  <p className="text-sm mt-1">{detailedAnalysis.interpretation_text}</p>
                </div>
              )}
              {detailedAnalysis.vigilance_signals && (detailedAnalysis.vigilance_signals as string[]).length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Signaux de vigilance</span>
                  {(detailedAnalysis.vigilance_signals as string[]).map((s: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 bg-warning/10 rounded-lg px-3 py-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-warning">{s}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Feedback section */}
        <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <h2 className="font-heading font-semibold">Mon ressenti</h2>
            </div>
            {feedback && !showFeedback && (
              <Button variant="ghost" size="sm" onClick={() => setShowFeedback(true)}>Modifier</Button>
            )}
          </div>

          {feedback && !showFeedback ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Effort perçu (RPE)</span>
                <p className="font-medium">{feedback.rpe}/10 — {RPE_LABELS[feedback.rpe] || ""}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Fatigue après</span>
                <p className="font-medium">{feedback.fatigue_after}/5 — {FATIGUE_LABELS[feedback.fatigue_after] || ""}</p>
              </div>
              {feedback.comment_text && (
                <div className="col-span-2">
                  <span className="text-muted-foreground text-xs">Commentaire</span>
                  <p className="text-sm">{feedback.comment_text}</p>
                </div>
              )}
            </div>
          ) : !showFeedback ? (
            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground mb-3">Comment t'es-tu senti pendant cette séance ?</p>
              <Button variant="outline" size="sm" onClick={() => setShowFeedback(true)}>
                Ajouter mon ressenti
              </Button>
            </div>
          ) : null}

          {showFeedback && (
            <div className="space-y-5 pt-2">
              {/* RPE Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Effort perçu (RPE)</label>
                  <span className="text-sm text-primary font-semibold">{rpe}/10</span>
                </div>
                <Slider
                  value={[rpe]}
                  onValueChange={([v]) => setRpe(v)}
                  min={1}
                  max={10}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">{RPE_LABELS[rpe]}</p>
              </div>

              {/* Fatigue Slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Fatigue après la séance</label>
                  <span className="text-sm text-primary font-semibold">{fatigue}/5</span>
                </div>
                <Slider
                  value={[fatigue]}
                  onValueChange={([v]) => setFatigue(v)}
                  min={1}
                  max={5}
                  step={1}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">{FATIGUE_LABELS[fatigue]}</p>
              </div>

              {/* Comment */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Commentaire (optionnel)</label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Sensations, météo, douleurs, motivation…"
                  rows={2}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={saveFeedback} disabled={savingFeedback} size="sm" className="gap-2">
                  {savingFeedback ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enregistrer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowFeedback(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-card rounded-lg shadow-card p-4 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="font-heading font-semibold text-sm">{value}</p>
    </div>
  );
}

function fmtDuration(sec: number | null | undefined): string {
  if (!sec && sec !== 0) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function fmtPaceFromSpeed(mps: number | null | undefined, sport: string): string {
  if (!mps || mps <= 0) return "—";
  if (sport === "bike") return `${(mps * 3.6).toFixed(1)} km/h`;
  // run / swim → min/km (swim usually min/100m but we keep min/km consistent unless swim)
  if (sport === "swim") {
    const secPer100 = 100 / mps;
    const m = Math.floor(secPer100 / 60);
    const s = Math.round(secPer100 % 60);
    return `${m}:${String(s).padStart(2, "0")} /100m`;
  }
  const secPerKm = 1000 / mps;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

function SplitsTable({ splits, sport }: { splits: any[]; sport: string }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/40 text-muted-foreground">
        <tr>
          <th className="text-left px-3 py-2 font-medium">Km</th>
          <th className="text-right px-3 py-2 font-medium">Temps</th>
          <th className="text-right px-3 py-2 font-medium">Allure</th>
          <th className="text-right px-3 py-2 font-medium">FC</th>
          {sport === "bike" && <th className="text-right px-3 py-2 font-medium">Puiss.</th>}
          <th className="text-right px-3 py-2 font-medium">D+</th>
        </tr>
      </thead>
      <tbody>
        {splits.map((s, i) => (
          <tr key={i} className="border-t border-border">
            <td className="px-3 py-2 font-medium">{s.split ?? i + 1}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtDuration(s.moving_time ?? s.elapsed_time)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtPaceFromSpeed(s.average_speed, sport)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{s.average_heartrate ? `${Math.round(s.average_heartrate)}` : "—"}</td>
            {sport === "bike" && (
              <td className="px-3 py-2 text-right tabular-nums">{s.average_watts ?? s.avg_watts ? `${Math.round(s.average_watts ?? s.avg_watts)} W` : "—"}</td>
            )}
            <td className="px-3 py-2 text-right tabular-nums">{s.elevation_difference != null ? `${Math.round(s.elevation_difference)}m` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LapsTable({ laps, sport }: { laps: any[]; sport: string }) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/40 text-muted-foreground">
        <tr>
          <th className="text-left px-3 py-2 font-medium">Lap</th>
          <th className="text-right px-3 py-2 font-medium">Distance</th>
          <th className="text-right px-3 py-2 font-medium">Temps</th>
          <th className="text-right px-3 py-2 font-medium">Allure</th>
          <th className="text-right px-3 py-2 font-medium">FC</th>
          {sport === "bike" && <th className="text-right px-3 py-2 font-medium">Puiss.</th>}
        </tr>
      </thead>
      <tbody>
        {laps.map((l, i) => (
          <tr key={i} className="border-t border-border">
            <td className="px-3 py-2 font-medium">{l.lap_index ?? i + 1}</td>
            <td className="px-3 py-2 text-right tabular-nums">{l.distance ? `${(l.distance / 1000).toFixed(2)} km` : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtDuration(l.moving_time ?? l.elapsed_time)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtPaceFromSpeed(l.average_speed, sport)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{l.average_heartrate ? `${Math.round(l.average_heartrate)}` : "—"}</td>
            {sport === "bike" && (
              <td className="px-3 py-2 text-right tabular-nums">{l.average_watts ?? l.avg_watts ? `${Math.round(l.average_watts ?? l.avg_watts)} W` : "—"}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
