import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, SkipForward, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

import StepIntro from "@/components/onboarding/StepIntro";
import StepHistory, { type HistoryData } from "@/components/onboarding/StepHistory";
import StepVolumes, { type VolumesData } from "@/components/onboarding/StepVolumes";
import StepPerformances, { type PerformancesData } from "@/components/onboarding/StepPerformances";
import StepMetrics, { type MetricsData } from "@/components/onboarding/StepMetrics";
import StepConstraints, { type ConstraintsData } from "@/components/onboarding/StepConstraints";

const STEP_LABELS = ["Introduction", "Historique", "Volumes", "Performances", "Métriques", "Contraintes"];
const TOTAL_STEPS = 6; // 0=intro, 1-5=content steps

const initialHistory: HistoryData = {
  sport_experience: {},
  current_frequency_per_week: null,
  strongest_discipline: "",
  weakest_discipline: "",
};

const initialVolumes: VolumesData = {
  weekly_volume_hours: {},
  sessions_per_week: null,
  longest_recent_swim: "",
  longest_recent_bike: "",
  longest_recent_run: "",
  typical_sessions: "",
};

const initialPerformances: PerformancesData = {
  triathlon: {},
  running: {},
  cycling: {},
  swimming: {},
};

const initialMetrics: MetricsData = {
  hr_max: "", hr_rest: "", ftp: "", threshold_pace_run: "", css: "",
  pace_100m_max: "", pace_100m_easy: "", weight: "",
  unknown: {},
};

const initialConstraints: ConstraintsData = {
  injuries_constraints: "",
  preferred_sessions: "",
  disliked_sessions: "",
  max_sessions_per_week: null,
  double_sessions: false,
  strength_training: false,
  time_preference: "",
  plan_failure_reason: "",
};

export default function EnrichedOnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<HistoryData>(initialHistory);
  const [volumes, setVolumes] = useState<VolumesData>(initialVolumes);
  const [performances, setPerformances] = useState<PerformancesData>(initialPerformances);
  const [metrics, setMetrics] = useState<MetricsData>(initialMetrics);
  const [constraints, setConstraints] = useState<ConstraintsData>(initialConstraints);

  const progress = (step / TOTAL_STEPS) * 100;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // 1. Upsert enriched profile
      const { error: profileError } = await supabase
        .from("athlete_enriched_profiles")
        .upsert({
          user_id: user.id,
          sport_experience: history.sport_experience,
          current_frequency_per_week: history.current_frequency_per_week,
          strongest_discipline: history.strongest_discipline || null,
          weakest_discipline: history.weakest_discipline || null,
          weekly_volume_hours: volumes.weekly_volume_hours,
          sessions_per_week: volumes.sessions_per_week,
          longest_recent_swim: volumes.longest_recent_swim || null,
          longest_recent_bike: volumes.longest_recent_bike || null,
          longest_recent_run: volumes.longest_recent_run || null,
          typical_sessions: volumes.typical_sessions || null,
          performances: performances as any,
          injuries_constraints: constraints.injuries_constraints || null,
          preferred_sessions: constraints.preferred_sessions || null,
          disliked_sessions: constraints.disliked_sessions || null,
          max_sessions_per_week: constraints.max_sessions_per_week,
          double_sessions: constraints.double_sessions,
          strength_training: constraints.strength_training,
          time_preference: constraints.time_preference || null,
          plan_failure_reason: constraints.plan_failure_reason || null,
          enriched_onboarding_completed: true,
        }, { onConflict: "user_id" });

      if (profileError) throw profileError;

      // 2. Insert metrics into athlete_metric_history
      const metricEntries: { metric_type: string; value: string; unit: string }[] = [
        { metric_type: "hr_max", value: metrics.hr_max, unit: "bpm" },
        { metric_type: "hr_rest", value: metrics.hr_rest, unit: "bpm" },
        { metric_type: "ftp", value: metrics.ftp, unit: "watts" },
        { metric_type: "threshold_pace_run", value: metrics.threshold_pace_run, unit: "min/km" },
        { metric_type: "css", value: metrics.css, unit: "min/100m" },
        { metric_type: "pace_100m_max", value: metrics.pace_100m_max, unit: "min/100m" },
        { metric_type: "pace_100m_easy", value: metrics.pace_100m_easy, unit: "min/100m" },
        { metric_type: "weight", value: metrics.weight, unit: "kg" },
      ];

      const toInsert = metricEntries
        .filter((m) => m.value && !metrics.unknown[m.metric_type])
        .map((m) => ({
          user_id: user.id,
          metric_type: m.metric_type,
          metric_value: isNaN(Number(m.value)) ? null : Number(m.value),
          metric_unit: m.unit,
          source_type: "onboarding",
          notes: isNaN(Number(m.value)) ? m.value : null,
        }));

      if (toInsert.length > 0) {
        const { error: metricsError } = await supabase
          .from("athlete_metric_history")
          .insert(toInsert);
        if (metricsError) throw metricsError;
      }

      toast.success("Profil enrichi enregistré !");
      navigate("/onboarding/enriched/summary");
    } catch (err: any) {
      toast.error("Erreur lors de l'enregistrement : " + (err.message || "Réessaie."));
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0: return <StepIntro onNext={() => setStep(1)} />;
      case 1: return <StepHistory data={history} onChange={setHistory} />;
      case 2: return <StepVolumes data={volumes} onChange={setVolumes} />;
      case 3: return <StepPerformances data={performances} onChange={setPerformances} />;
      case 4: return <StepMetrics data={metrics} onChange={setMetrics} />;
      case 5: return <StepConstraints data={constraints} onChange={setConstraints} />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Progress */}
        {step > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{STEP_LABELS[step]}</span>
              <span>Étape {step}/{TOTAL_STEPS - 1}</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Step content */}
        <div className="min-h-[400px]">
          {renderStep()}
        </div>

        {/* Navigation (hidden on intro since intro has its own button) */}
        {step > 0 && (
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Précédent
            </Button>
            <div className="flex items-center gap-2">
              {step < TOTAL_STEPS - 1 && (
                <Button variant="outline" onClick={() => setStep(step + 1)}>
                  <SkipForward className="h-4 w-4 mr-1" /> Passer
                </Button>
              )}
              {step < TOTAL_STEPS - 1 ? (
                <Button onClick={() => setStep(step + 1)}>
                  Suivant <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                  Valider mon profil
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Encouragement */}
        {step > 0 && (
          <p className="text-xs text-center text-muted-foreground">
            💡 Plus ton profil est complet, plus ton futur plan sera pertinent.
          </p>
        )}
      </div>
    </div>
  );
}
