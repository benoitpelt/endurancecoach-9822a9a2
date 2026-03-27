import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Clock, Ruler, Zap, Target, MessageSquare, Apple } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const SPORT_LABELS: Record<string, string> = {
  swim: "Natation", bike: "Vélo", run: "Course à pied",
  strength: "Renforcement", mobility: "Mobilité", rest: "Repos",
};
const SPORT_EMOJI: Record<string, string> = {
  swim: "🏊", bike: "🚴", run: "🏃", strength: "💪", mobility: "🧘", rest: "😴",
};
const PRIORITY_STYLES: Record<string, { label: string; classes: string }> = {
  key: { label: "Séance clé", classes: "bg-primary/15 text-primary border border-primary/30" },
  important: { label: "Important", classes: "bg-warning/15 text-warning border border-warning/30" },
  optional: { label: "Optionnel", classes: "bg-muted text-muted-foreground" },
};

export default function WorkoutDetailPage() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workout, setWorkout] = useState<any>(null);

  useEffect(() => {
    if (!user || !workoutId) return;
    loadWorkout();
  }, [user, workoutId]);

  const loadWorkout = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("planned_workouts")
        .select("*")
        .eq("id", workoutId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (err) throw err;
      if (!data) { setError("Séance introuvable."); setLoading(false); return; }
      setWorkout(data);
    } catch {
      setError("Erreur de chargement.");
    } finally {
      setLoading(false);
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

  if (error || !workout) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
          <p className="text-destructive text-center">{error || "Séance introuvable."}</p>
        </div>
      </div>
    );
  }

  const pr = PRIORITY_STYLES[workout.workout_priority] || PRIORITY_STYLES.important;
  const hasNutrition = workout.carb_strategy_type || workout.carb_before_g || workout.carb_during_g_per_hour || workout.carb_total_target_g || workout.hydration_note;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate(`/plan/week/${workout.week_id}`)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Retour à la semaine
        </Button>

        {/* Header */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
          <div className="flex items-start gap-4">
            <span className="text-4xl">{SPORT_EMOJI[workout.sport_type] || "🏋️"}</span>
            <div className="space-y-1 flex-1">
              <h1 className="text-2xl font-heading font-bold">
                {SPORT_LABELS[workout.sport_type] || workout.sport_type}
              </h1>
              <p className="text-sm text-muted-foreground capitalize">{formatDate(workout.scheduled_date)}</p>
            </div>
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${pr.classes}`}>
              {pr.label}
            </span>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {workout.duration_target_minutes && (
            <DetailCard icon={Clock} label="Durée" value={`${workout.duration_target_minutes} min`} />
          )}
          {workout.distance_target_km && (
            <DetailCard icon={Ruler} label="Distance" value={`${workout.distance_target_km} km`} />
          )}
          {workout.intensity_zone_label && (
            <DetailCard icon={Zap} label="Intensité" value={workout.intensity_zone_label} />
          )}
        </div>

        {/* Session goal */}
        {workout.session_goal && (
          <div className="bg-card rounded-xl shadow-card p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h2 className="font-heading font-semibold">Objectif de la séance</h2>
            </div>
            <p className="text-sm text-muted-foreground">{workout.session_goal}</p>
          </div>
        )}

        {/* Structure */}
        {workout.structure_text && (
          <div className="bg-card rounded-xl shadow-card p-5 space-y-2">
            <h2 className="font-heading font-semibold">Structure</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{workout.structure_text}</p>
          </div>
        )}

        {/* Coach note */}
        {workout.coach_note_short && (
          <div className="bg-gradient-subtle rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <h2 className="font-heading font-semibold">Note du coach</h2>
            </div>
            <p className="text-sm">{workout.coach_note_short}</p>
          </div>
        )}

        {/* Nutrition section - structural, shows only if data present */}
        {hasNutrition ? (
          <div className="bg-card rounded-xl shadow-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Apple className="h-4 w-4 text-accent" />
              <h2 className="font-heading font-semibold">Nutrition</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {workout.carb_strategy_type && (
                <div><span className="text-muted-foreground">Stratégie</span><p className="font-medium">{workout.carb_strategy_type}</p></div>
              )}
              {workout.carb_before_g != null && (
                <div><span className="text-muted-foreground">Avant</span><p className="font-medium">{workout.carb_before_g}g glucides</p></div>
              )}
              {workout.carb_during_g_per_hour != null && (
                <div><span className="text-muted-foreground">Pendant</span><p className="font-medium">{workout.carb_during_g_per_hour}g/h</p></div>
              )}
              {workout.carb_total_target_g != null && (
                <div><span className="text-muted-foreground">Total cible</span><p className="font-medium">{workout.carb_total_target_g}g</p></div>
              )}
              {workout.hydration_note && (
                <div className="col-span-2"><span className="text-muted-foreground">Hydratation</span><p className="font-medium">{workout.hydration_note}</p></div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-muted/50 rounded-xl p-5 space-y-1">
            <div className="flex items-center gap-2">
              <Apple className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-heading font-semibold text-sm text-muted-foreground">Nutrition</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Les recommandations nutritionnelles seront disponibles prochainement.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
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
