import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Clock, Ruler, Zap, Target, MessageSquare, Apple, Droplets, Waves, Flame } from "lucide-react";
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
const CARB_STRATEGY_LABELS: Record<string, string> = {
  none: "Pas de prise nécessaire",
  optional_low: "Optionnel : 20–30 g/h",
  moderate: "Cible : 40–60 g/h",
  high: "Cible : 60–90 g/h",
  gut_training: "Séance de gut training",
  race_strategy: "Tester la stratégie course",
};
const GUT_PRIORITY_LABELS: Record<string, string> = {
  low: "Faible", medium: "Modéré", high: "Élevé",
};
const TARGET_TYPE_LABELS: Record<string, string> = {
  pace: "Allure", power: "Puissance", css: "CSS", hr: "FC", rpe: "RPE", zone: "Zone",
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

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "EEEE d MMMM yyyy", { locale: fr }); } catch { return d; }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (error || !workout) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2"><ArrowLeft className="h-4 w-4" /> Retour</Button>
          <p className="text-destructive text-center">{error || "Séance introuvable."}</p>
        </div>
      </div>
    );
  }

  const pr = PRIORITY_STYLES[workout.workout_priority] || PRIORITY_STYLES.important;
  const hasNutrition = workout.carb_strategy_type && workout.carb_strategy_type !== "none";
  const structureBlocks = parseStructureJson(workout.workout_structure_json);
  const distanceLabel = getDistanceLabel(workout);

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
              <p className="text-sm text-muted-foreground capitalize">{fmtDate(workout.scheduled_date)}</p>
              {workout.target_summary_label && (
                <p className="text-sm font-medium text-primary">{workout.target_summary_label}</p>
              )}
            </div>
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${pr.classes}`}>{pr.label}</span>
          </div>
        </div>

        {/* Volume & targets */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {workout.duration_target_minutes && (
            <DetailCard icon={Clock} label="Durée" value={`${workout.duration_target_minutes} min`} />
          )}
          {distanceLabel && (
            <DetailCard icon={Ruler} label="Distance" value={distanceLabel} />
          )}
          {workout.primary_target_value_text && (
            <DetailCard
              icon={workout.primary_target_type === "power" ? Flame : Zap}
              label={TARGET_TYPE_LABELS[workout.primary_target_type] || "Cible"}
              value={workout.primary_target_value_text}
            />
          )}
          {!workout.primary_target_value_text && workout.intensity_zone_label && (
            <DetailCard icon={Zap} label="Intensité" value={workout.intensity_zone_label} />
          )}
          {workout.secondary_target_value_text && (
            <DetailCard icon={Waves} label="Cible sec." value={workout.secondary_target_value_text} />
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

        {/* Structured blocks: warmup / main / cooldown */}
        {(workout.warmup_summary || workout.main_set_summary || workout.cooldown_summary) && (
          <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
            <h2 className="font-heading font-semibold">Structure de la séance</h2>
            {workout.warmup_summary && (
              <PhaseBlock phase="Échauffement" description={workout.warmup_summary} color="text-accent" />
            )}
            {workout.main_set_summary && (
              <PhaseBlock phase="Bloc principal" description={workout.main_set_summary} color="text-primary" />
            )}
            {workout.cooldown_summary && (
              <PhaseBlock phase="Retour au calme" description={workout.cooldown_summary} color="text-muted-foreground" />
            )}
          </div>
        )}

        {/* Detailed structure blocks */}
        {structureBlocks.length > 0 && (
          <div className="bg-card rounded-xl shadow-card p-5 space-y-3">
            <h2 className="font-heading font-semibold">Détail bloc par bloc</h2>
            <div className="space-y-2">
              {structureBlocks.map((b: any, i: number) => (
                <div key={i} className="flex items-start gap-3 text-sm border-l-2 border-muted pl-3 py-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase min-w-[70px]">{b.phase || `Bloc ${i + 1}`}</span>
                  <div className="flex-1">
                    <p className="font-medium">{b.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        b.duration_min && `${b.duration_min}min`,
                        b.distance_m && `${b.distance_m}m`,
                        b.target && `Cible: ${b.target}`,
                        b.rest && `Récup: ${b.rest}`,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legacy structure_text fallback */}
        {!workout.warmup_summary && !workout.main_set_summary && structureBlocks.length === 0 && workout.structure_text && (
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

        {/* Nutrition section */}
        {hasNutrition && (
          <div className="bg-card rounded-xl shadow-card p-5 space-y-4 border border-accent/20">
            <div className="flex items-center gap-2">
              <Apple className="h-4 w-4 text-accent" />
              <h2 className="font-heading font-semibold">Stratégie nutritionnelle</h2>
            </div>
            <div className="bg-accent/10 rounded-lg px-4 py-3">
              <p className="text-sm font-medium">
                {CARB_STRATEGY_LABELS[workout.carb_strategy_type] || workout.carb_strategy_type}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {workout.carb_before_g != null && (
                <div><span className="text-muted-foreground text-xs">Avant la séance</span><p className="font-medium">{workout.carb_before_g}g glucides</p></div>
              )}
              {workout.carb_during_g_per_hour != null && (
                <div><span className="text-muted-foreground text-xs">Pendant</span><p className="font-medium">{workout.carb_during_g_per_hour}g/h</p></div>
              )}
              {workout.carb_total_target_g != null && (
                <div><span className="text-muted-foreground text-xs">Total cible</span><p className="font-medium">{workout.carb_total_target_g}g</p></div>
              )}
              {workout.gut_training_priority && (
                <div><span className="text-muted-foreground text-xs">Priorité gut training</span><p className="font-medium">{GUT_PRIORITY_LABELS[workout.gut_training_priority] || workout.gut_training_priority}</p></div>
              )}
            </div>
            {workout.hydration_note && (
              <div className="flex items-start gap-2 text-sm">
                <Droplets className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                <p className="text-muted-foreground">{workout.hydration_note}</p>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Ces consignes sont des repères d'entraînement nutritionnel, pas des prescriptions médicales. Adapte selon tes sensations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PhaseBlock({ phase, description, color }: { phase: string; description: string; color: string }) {
  return (
    <div className="space-y-1">
      <p className={`text-xs font-semibold uppercase ${color}`}>{phase}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
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

function getDistanceLabel(workout: any): string | null {
  if (workout.sport_type === "swim" && workout.distance_target_meters) {
    return `${workout.distance_target_meters}m`;
  }
  if (workout.distance_target_km) {
    return `${workout.distance_target_km} km`;
  }
  if (workout.distance_target_meters) {
    return `${(workout.distance_target_meters / 1000).toFixed(1)} km`;
  }
  return null;
}

function parseStructureJson(json: any): any[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  try {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
