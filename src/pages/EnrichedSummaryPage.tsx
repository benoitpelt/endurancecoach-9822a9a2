import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Pencil, User, Activity, BarChart3, Heart, Shield, AlertTriangle, CheckCircle2, HelpCircle, ArrowLeft } from "lucide-react";

const METRIC_LABELS: Record<string, { label: string; unit: string }> = {
  hr_max: { label: "FC max", unit: "bpm" },
  hr_rest: { label: "FC repos", unit: "bpm" },
  ftp: { label: "FTP", unit: "watts" },
  threshold_pace_run: { label: "Allure seuil course", unit: "min/km" },
  css: { label: "CSS", unit: "min/100m" },
  pace_100m_max: { label: "100m max natation", unit: "min/100m" },
  pace_100m_easy: { label: "100m endurance natation", unit: "min/100m" },
  weight: { label: "Poids", unit: "kg" },
};

const ALL_METRIC_TYPES = Object.keys(METRIC_LABELS);

const DISCIPLINE_LABELS: Record<string, string> = {
  swimming: "Natation", cycling: "Vélo", running: "Course à pied",
};

export default function EnrichedSummaryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [enriched, setEnriched] = useState<any>(null);
  const [latestMetrics, setLatestMetrics] = useState<Record<string, any>>({});
  const [goal, setGoal] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("athlete_enriched_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("athlete_metric_history").select("*").eq("user_id", user.id).order("observed_at", { ascending: false }),
      supabase.from("race_goals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("athlete_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    ]).then(([e, m, g, p]) => {
      setEnriched(e.data);
      // Deduplicate: latest per metric_type
      const metricsMap: Record<string, any> = {};
      (m.data || []).forEach((row: any) => {
        if (!metricsMap[row.metric_type]) metricsMap[row.metric_type] = row;
      });
      setLatestMetrics(metricsMap);
      setGoal(g.data);
      setProfile(p.data);
      setLoading(false);
    });
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!enriched) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Aucun profil enrichi trouvé.</p>
          <Button onClick={() => navigate("/onboarding/enriched")}>Commencer l'onboarding enrichi</Button>
        </div>
      </div>
    );
  }

  // Completeness score
  const completenessItems = computeCompleteness(enriched, latestMetrics);
  const filled = completenessItems.filter((i) => i.filled).length;
  const total = completenessItems.length;
  const score = Math.round((filled / total) * 100);

  const knownMetrics = ALL_METRIC_TYPES.filter((t) => latestMetrics[t]);
  const unknownMetrics = ALL_METRIC_TYPES.filter((t) => !latestMetrics[t]);

  const coherence = assessCoherence(enriched, latestMetrics, goal);

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/summary")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Bilan athlète</h1>
        </div>

        {/* Completeness Score */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-semibold text-lg">Score de complétude</h2>
            <span className="text-2xl font-bold text-primary">{score}%</span>
          </div>
          <Progress value={score} className="h-3" />
          <p className="text-sm text-muted-foreground">
            {score < 40 ? "Ton profil est encore très partiel — n'hésite pas à le compléter pour un plan plus précis."
              : score < 70 ? "Bon début ! Quelques informations supplémentaires rendraient le plan encore meilleur."
              : score < 90 ? "Profil bien renseigné. Plus que quelques détails pour un plan optimal."
              : "Excellent ! Ton profil est très complet. 🎉"}
          </p>
        </div>

        {/* Sport Profile */}
        <Section icon={User} title="Profil sportif" onEdit={() => navigate("/onboarding/enriched", { state: { step: 1 } })}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <SField label="Fréquence" value={enriched.current_frequency_per_week ? `${enriched.current_frequency_per_week} séances/sem` : null} />
            <SField label="Point fort" value={DISCIPLINE_LABELS[enriched.strongest_discipline] || null} />
            <SField label="Point faible" value={DISCIPLINE_LABELS[enriched.weakest_discipline] || null} />
            <SField label="Séances/sem" value={enriched.sessions_per_week ? `${enriched.sessions_per_week}` : null} />
          </div>
          {Object.keys(enriched.sport_experience || {}).length > 0 && (
            <div className="mt-3 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Expérience par sport</span>
              {Object.entries(enriched.sport_experience as Record<string, any>).map(([sport, data]) => (
                <div key={sport} className="text-sm flex justify-between">
                  <span>{DISCIPLINE_LABELS[sport] || sport}</span>
                  <span className="text-muted-foreground">
                    {data.years ? `${data.years} ans` : ""}
                    {data.prepared_goals ? ` — ${data.prepared_goals}` : ""}
                    {!data.years && !data.prepared_goals ? "—" : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Volumes */}
        <Section icon={Activity} title="Volumes récents" onEdit={() => navigate("/onboarding/enriched", { state: { step: 2 } })}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <SField label="Plus longue natation" value={enriched.longest_recent_swim} />
            <SField label="Plus long vélo" value={enriched.longest_recent_bike} />
            <SField label="Plus longue course" value={enriched.longest_recent_run} />
            <SField label="Séances types" value={enriched.typical_sessions} />
          </div>
        </Section>

        {/* Known Metrics */}
        <Section icon={Heart} title="Métriques connues" onEdit={() => navigate("/onboarding/enriched", { state: { step: 4 } })}>
          {knownMetrics.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {knownMetrics.map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0" />
                  <span className="text-muted-foreground">{METRIC_LABELS[t].label}</span>
                  <span className="ml-auto font-medium">
                    {latestMetrics[t].notes || latestMetrics[t].metric_value} {METRIC_LABELS[t].unit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Aucune métrique renseignée.</p>
          )}
        </Section>

        {/* Uncertainty Zones */}
        {unknownMetrics.length > 0 && (
          <Section icon={HelpCircle} title="Zones d'incertitude" onEdit={() => navigate("/onboarding/enriched", { state: { step: 4 } })}>
            <div className="space-y-1">
              {unknownMetrics.map((t) => (
                <div key={t} className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                  <span className="text-muted-foreground">{METRIC_LABELS[t].label}</span>
                  <span className="ml-auto text-xs text-muted-foreground italic">Non renseigné — sera estimé plus tard</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Performances */}
        <Section icon={BarChart3} title="Performances passées" onEdit={() => navigate("/onboarding/enriched", { state: { step: 3 } })}>
          <PerformancesBlock performances={enriched.performances} />
        </Section>

        {/* Constraints */}
        <Section icon={Shield} title="Contraintes & préférences" onEdit={() => navigate("/onboarding/enriched", { state: { step: 5 } })}>
          <div className="space-y-2 text-sm">
            <SField label="Limites / fragilités" value={enriched.injuries_constraints} />
            <SField label="Séances préférées" value={enriched.preferred_sessions} />
            <SField label="Séances moins aimées" value={enriched.disliked_sessions} />
            <SField label="Max séances/sem" value={enriched.max_sessions_per_week ? `${enriched.max_sessions_per_week}` : null} />
            <SField label="Doubles séances" value={enriched.double_sessions ? "Oui" : "Non"} />
            <SField label="Renforcement" value={enriched.strength_training ? "Oui" : "Non"} />
            <SField label="Préférence horaire" value={enriched.time_preference ? ({ morning: "Matin", midday: "Midi", evening: "Soir", no_preference: "Pas de préférence" } as any)[enriched.time_preference] : null} />
            <SField label="Ce qui fait rater le plan" value={enriched.plan_failure_reason} />
          </div>
        </Section>

        {/* Coherence Assessment */}
        <div className={`rounded-xl p-6 space-y-3 ${coherence.level === "positive" ? "bg-accent/10 border border-accent/30" : coherence.level === "warning" ? "bg-warning/10 border border-warning/30" : "bg-gradient-subtle"}`}>
          <h2 className="font-heading font-semibold text-lg">Cohérence profil / objectif</h2>
          <p className="text-sm leading-relaxed">{coherence.text}</p>
          <p className="text-xs text-muted-foreground italic">
            Cette appréciation est qualitative et non définitive. Elle sera affinée lorsque le plan sera généré.
          </p>
        </div>

        {/* Missing info */}
        {completenessItems.filter((i) => !i.filled).length > 0 && (
          <div className="bg-card rounded-xl shadow-card p-6 space-y-3">
            <h2 className="font-heading font-semibold text-lg">Informations manquantes</h2>
            <ul className="space-y-1">
              {completenessItems.filter((i) => !i.filled).map((i, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                  {i.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next steps */}
        <div className="bg-gradient-subtle rounded-xl p-6 text-center space-y-3">
          <p className="font-heading font-semibold">Prochaine étape</p>
          <p className="text-sm text-muted-foreground">
            Ton profil enrichi est enregistré. La génération de ton plan d'entraînement personnalisé arrivera bientôt.
          </p>
          <Button variant="outline" onClick={() => navigate("/summary")}>
            Retour au récapitulatif
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---

function Section({ icon: Icon, title, onEdit, children }: { icon: any; title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">{title}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4 mr-1" /> Modifier
        </Button>
      </div>
      {children}
    </div>
  );
}

function SField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value || "—"}</span>
    </div>
  );
}

function PerformancesBlock({ performances }: { performances: any }) {
  if (!performances || Object.keys(performances).length === 0) {
    return <p className="text-muted-foreground text-sm">Aucune performance renseignée.</p>;
  }
  const sportLabels: Record<string, string> = { triathlon: "Triathlon", running: "Course à pied", cycling: "Vélo", swimming: "Natation" };
  const fieldLabels: Record<string, string> = {
    longest_format: "Plus long format",
    longest_run: "Plus longue course",
    longest_ride: "Plus longue sortie vélo",
    longest_swim: "Plus longue natation",
    // Compatibilité ascendante avec anciens profils
    formats_done: "Formats réalisés", reference_time: "Temps de référence",
    best_5k: "Meilleur 5 km", best_10k: "Meilleur 10 km", best_half: "Meilleur semi", best_marathon: "Meilleur marathon", recent_reference: "Chrono récent",
    events: "Événements", level_reference: "Repère de niveau",
    best_100m: "Meilleur 100 m", other_reference: "Autre repère",
  };

  return (
    <div className="space-y-3">
      {Object.entries(performances).map(([sport, data]: [string, any]) => {
        const entries = Object.entries(data || {}).filter(([, v]) => v);
        if (entries.length === 0) return null;
        return (
          <div key={sport}>
            <span className="text-xs font-medium text-muted-foreground">{sportLabels[sport] || sport}</span>
            {entries.map(([field, value]) => (
              <div key={field} className="flex justify-between text-sm py-0.5">
                <span className="text-muted-foreground">{fieldLabels[field] || field}</span>
                <span>{String(value)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function computeCompleteness(enriched: any, metrics: Record<string, any>) {
  const items: { label: string; filled: boolean }[] = [
    { label: "Expérience sportive", filled: Object.keys(enriched.sport_experience || {}).length > 0 },
    { label: "Fréquence d'entraînement", filled: !!enriched.current_frequency_per_week },
    { label: "Discipline la plus forte", filled: !!enriched.strongest_discipline },
    { label: "Discipline la plus faible", filled: !!enriched.weakest_discipline },
    { label: "Volume hebdomadaire", filled: Object.values(enriched.weekly_volume_hours || {}).some((v: any) => v) },
    { label: "Séances par semaine", filled: !!enriched.sessions_per_week },
    { label: "Plus longue natation récente", filled: !!enriched.longest_recent_swim },
    { label: "Plus long vélo récent", filled: !!enriched.longest_recent_bike },
    { label: "Plus longue course récente", filled: !!enriched.longest_recent_run },
    { label: "Performances triathlon", filled: Object.values((enriched.performances as any)?.triathlon || {}).some((v: any) => v) },
    { label: "Performances course", filled: Object.values((enriched.performances as any)?.running || {}).some((v: any) => v) },
    { label: "Performances vélo", filled: Object.values((enriched.performances as any)?.cycling || {}).some((v: any) => v) },
    { label: "Performances natation", filled: Object.values((enriched.performances as any)?.swimming || {}).some((v: any) => v) },
    ...ALL_METRIC_TYPES.map((t) => ({ label: METRIC_LABELS[t].label, filled: !!metrics[t] })),
    { label: "Contraintes / limites", filled: !!enriched.injuries_constraints },
    { label: "Max séances/sem", filled: !!enriched.max_sessions_per_week },
    { label: "Ce qui fait rater le plan", filled: !!enriched.plan_failure_reason },
  ];
  return items;
}

function assessCoherence(enriched: any, metrics: Record<string, any>, goal: any): { level: "positive" | "warning" | "neutral"; text: string } {
  if (!goal) {
    return { level: "neutral", text: "Aucun objectif déclaré pour le moment. Définis ton objectif pour obtenir une lecture de cohérence." };
  }

  const knownCount = ALL_METRIC_TYPES.filter((t) => metrics[t]).length;
  const hasExperience = Object.keys(enriched?.sport_experience || {}).length > 0;
  const goalSport = goal.goal_type; // triathlon, running, cycling
  const hasRelevantExp = enriched?.sport_experience?.[goalSport === "running" ? "running" : goalSport === "cycling" ? "cycling" : "swimming"];

  if (knownCount >= 4 && hasRelevantExp) {
    return {
      level: "positive",
      text: `Ton profil semble compatible avec ton objectif de ${goal.format || goal.goal_type}. Tu as de l'expérience dans la discipline visée et plusieurs métriques sont renseignées. Cela nous permettra de construire un plan pertinent.`,
    };
  }

  if (knownCount < 2 && !hasExperience) {
    return {
      level: "warning",
      text: `Peu de données disponibles pour évaluer la faisabilité de ton objectif de ${goal.format || goal.goal_type}. Complète ton profil pour une meilleure évaluation. Le plan initial sera plus prudent.`,
    };
  }

  return {
    level: "neutral",
    text: `Ton profil est partiellement renseigné. Avec les informations actuelles, il est difficile de se prononcer sur la cohérence avec ton objectif de ${goal.format || goal.goal_type}. Plus tu complètes, mieux on pourra ajuster.`,
  };
}
