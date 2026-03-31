import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ChevronRight, Apple, Pencil, Clock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const WEEK_TYPE_LABELS: Record<string, string> = {
  normal: "Normale", recovery: "Récupération", taper: "Affûtage", race_week: "Semaine de course",
};
const SPORT_LABELS: Record<string, string> = {
  swim: "Natation", bike: "Vélo", run: "Course à pied",
  strength: "Renforcement", mobility: "Mobilité", rest: "Repos",
};
const SPORT_EMOJI: Record<string, string> = {
  swim: "🏊", bike: "🚴", run: "🏃", strength: "💪", mobility: "🧘", rest: "😴",
};
const PRIORITY_STYLES: Record<string, { label: string; classes: string }> = {
  key: { label: "Clé", classes: "bg-primary/15 text-primary border border-primary/30" },
  important: { label: "Important", classes: "bg-warning/15 text-warning border border-warning/30" },
  optional: { label: "Optionnel", classes: "bg-muted text-muted-foreground" },
};

type Workout = {
  id: string;
  sport_type: string;
  scheduled_date: string | null;
  workout_priority: string;
  status: string;
  session_goal: string | null;
  duration_target_minutes: number | null;
  distance_target_km: number | null;
  distance_target_meters: number | null;
  intensity_zone_label: string | null;
  target_summary_label: string | null;
  primary_target_value_text: string | null;
  carb_strategy_type: string | null;
  gut_training_priority: string | null;
};

export default function WeekPage() {
  const { weekId } = useParams<{ weekId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState<any>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);

  useEffect(() => {
    if (!user || !weekId) return;
    loadWeek();
  }, [user, weekId]);

  const loadWeek = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: weekData, error: wErr } = await supabase
        .from("training_weeks").select("*").eq("id", weekId!).eq("user_id", user!.id).maybeSingle();
      if (wErr) throw wErr;
      if (!weekData) { setError("Semaine introuvable."); setLoading(false); return; }
      setWeek(weekData);

      const { data: workoutsData } = await supabase
        .from("planned_workouts")
        .select("id, sport_type, scheduled_date, workout_priority, status, session_goal, duration_target_minutes, distance_target_km, distance_target_meters, intensity_zone_label, target_summary_label, primary_target_value_text, carb_strategy_type, gut_training_priority")
        .eq("week_id", weekId!).eq("user_id", user!.id).order("scheduled_date");
      setWorkouts((workoutsData || []) as Workout[]);
    } catch {
      setError("Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "EEEE d MMM", { locale: fr }); } catch { return d; }
  };

  const hasNutrition = (wo: Workout) => wo.carb_strategy_type && wo.carb_strategy_type !== "none";

  const getDistanceLabel = (wo: Workout): string | null => {
    if (wo.sport_type === "swim" && wo.distance_target_meters) return `${wo.distance_target_meters}m`;
    if (wo.distance_target_km) return `${wo.distance_target_km}km`;
    if (wo.distance_target_meters) return `${(wo.distance_target_meters / 1000).toFixed(1)}km`;
    return null;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (error || !week) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => navigate("/plan")} className="gap-2"><ArrowLeft className="h-4 w-4" /> Retour au plan</Button>
          <p className="text-destructive text-center">{error || "Semaine introuvable."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/plan")} className="gap-2"><ArrowLeft className="h-4 w-4" /> Retour au plan</Button>

        {/* Week header */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-heading font-bold">Semaine {week.week_number}</h1>
            <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              {WEEK_TYPE_LABELS[week.week_type] || week.week_type}
            </span>
          </div>
          {(week.start_date || week.end_date) && (
            <p className="text-sm text-muted-foreground">{fmtDate(week.start_date)} → {fmtDate(week.end_date)}</p>
          )}
          {week.notes && <p className="text-sm text-muted-foreground">{week.notes}</p>}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" onClick={() => navigate(`/plan/week/${weekId}/adjust`)} className="gap-2">
              <Pencil className="h-3.5 w-3.5" /> Modifier ma semaine
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(`/plan/week/${weekId}/history`)} className="gap-2">
              <Clock className="h-3.5 w-3.5" /> Historique
            </Button>
          </div>
        </div>

        {/* Workouts */}
        {workouts.length === 0 ? (
          <div className="bg-card rounded-xl shadow-card p-6 text-center space-y-2">
            <p className="text-muted-foreground">Aucune séance prévue cette semaine.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {workouts.map((wo) => {
              const pr = PRIORITY_STYLES[wo.workout_priority] || PRIORITY_STYLES.important;
              const showNutrition = hasNutrition(wo);
              const dist = getDistanceLabel(wo);
              return (
                <button
                  key={wo.id}
                  onClick={() => navigate(`/plan/workout/${wo.id}`)}
                  className="w-full text-left bg-card rounded-lg shadow-card p-4 hover:shadow-elevated transition-shadow"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl flex-shrink-0">{SPORT_EMOJI[wo.sport_type] || "🏋️"}</span>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-heading font-semibold text-sm">
                            {SPORT_LABELS[wo.sport_type] || wo.sport_type}
                          </span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${pr.classes}`}>{pr.label}</span>
                          {showNutrition && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 flex items-center gap-1">
                              <Apple className="h-2.5 w-2.5" /> Nutri
                            </span>
                          )}
                        </div>
                        {/* Target summary - the key improvement */}
                        {wo.target_summary_label && (
                          <p className="text-xs font-medium text-primary truncate">{wo.target_summary_label}</p>
                        )}
                        <p className="text-xs text-muted-foreground truncate">
                          {fmtDate(wo.scheduled_date)}
                          {wo.duration_target_minutes && ` · ${wo.duration_target_minutes}min`}
                          {dist && ` · ${dist}`}
                          {wo.primary_target_value_text && ` · ${wo.primary_target_value_text}`}
                          {!wo.primary_target_value_text && wo.intensity_zone_label && ` · ${wo.intensity_zone_label}`}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
