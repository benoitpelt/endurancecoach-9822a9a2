import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, User, Target, Calendar, LogOut, Pencil, Layers, CheckCircle2 } from "lucide-react";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const SEX_LABELS: Record<string, string> = { male: "Homme", female: "Femme", other: "Autre", prefer_not_to_say: "Non précisé" };
const GOAL_TYPE_LABELS: Record<string, string> = { triathlon: "Triathlon", running: "Course à pied", cycling: "Vélo" };

export default function SummaryPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [goal, setGoal] = useState<any>(null);
  const [availability, setAvailability] = useState<any[]>([]);
  const [enrichedScore, setEnrichedScore] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("athlete_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("race_goals").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("default_availability_rules").select("*").eq("user_id", user.id).order("day_of_week"),
      supabase.from("athlete_enriched_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("athlete_metric_history").select("*").eq("user_id", user.id).order("observed_at", { ascending: false }),
    ]).then(([p, g, a, e, m]) => {
      setProfile(p.data);
      setGoal(g.data);
      setAvailability(a.data || []);

      // Compute enriched profile completeness
      const enriched = e.data;
      if (enriched) {
        const metricsMap: Record<string, any> = {};
        (m.data || []).forEach((row: any) => {
          if (!metricsMap[row.metric_type]) metricsMap[row.metric_type] = row;
        });
        const items = computeEnrichedCompleteness(enriched, metricsMap);
        const filled = items.filter((i) => i.filled).length;
        setEnrichedScore(Math.round((filled / items.length) * 100));
      } else {
        setEnrichedScore(0);
      }

      setLoading(false);
    });
  }, [user]);

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Récapitulatif</h1>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" /> Déconnexion
          </Button>
        </div>

        {/* Profile */}
        <Section icon={User} title="Profil" onEdit={() => navigate("/onboarding/profile")}>
          {profile ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field label="Prénom" value={profile.display_name} />
              <Field label="Sexe" value={profile.sex ? SEX_LABELS[profile.sex] : null} />
              <Field label="Naissance" value={profile.date_of_birth} />
              <Field label="Poids" value={profile.weight_kg ? `${profile.weight_kg} kg` : null} />
              <Field label="Taille" value={profile.height_cm ? `${profile.height_cm} cm` : null} />
              <Field label="Lieu" value={[profile.city, profile.country].filter(Boolean).join(", ") || null} />
              <Field label="Piscine" value={profile.pool_access ? "Oui" : "Non"} />
              <Field label="Home trainer" value={profile.home_trainer ? "Oui" : "Non"} />
              <Field label="Salle" value={profile.gym_access ? "Oui" : "Non"} />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Profil non renseigné.</p>
          )}
        </Section>

        {/* Goal */}
        <Section icon={Target} title="Objectif" onEdit={() => navigate("/onboarding/goal")}>
          {goal ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field label="Type" value={GOAL_TYPE_LABELS[goal.goal_type]} />
              <Field label="Format" value={goal.format} />
              <Field label="Compétition" value={goal.is_competition ? "Oui" : "Non"} />
              <Field label="Événement" value={goal.event_name} />
              <Field label="Date cible" value={goal.target_date} />
              <Field label="Lieu" value={goal.location} />
              <Field label="Objectif" value={goal.primary_objective} />
              <Field label="Temps cible" value={goal.target_time} />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Objectif non renseigné.</p>
          )}
        </Section>

        {/* Availability */}
        <Section icon={Calendar} title="Disponibilités" onEdit={() => navigate("/onboarding/availability")}>
          {availability.length > 0 ? (
            <div className="space-y-1 text-sm">
              {DAYS.map((day, i) => {
                const rule = availability.find(a => a.day_of_week === i);
                return (
                  <div key={day} className="flex justify-between py-1">
                    <span className="font-medium">{day}</span>
                    <span className="text-muted-foreground">
                      {rule?.is_available
                        ? `${rule.max_duration_minutes ? rule.max_duration_minutes + " min" : "Disponible"}${rule.note ? " — " + rule.note : ""}`
                        : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Disponibilités non renseignées.</p>
          )}
        </Section>

        {/* Plan entry */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h2 className="font-heading font-semibold text-lg">Mon plan</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Consulte la structure de ton plan d'entraînement, tes semaines et tes séances.
          </p>
          <Button onClick={() => navigate("/plan")} variant="outline">
            Voir mon plan
          </Button>
        </div>

        <div className="bg-gradient-subtle rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-heading font-semibold">Affiner mon profil</p>
            {enrichedScore !== null && (
              <span className={`text-lg font-bold ${enrichedScore >= 70 ? "text-accent" : enrichedScore >= 40 ? "text-primary" : "text-warning"}`}>
                {enrichedScore}%
              </span>
            )}
          </div>
          {enrichedScore !== null && (
            <Progress value={enrichedScore} className="h-2" />
          )}
          <p className="text-sm text-muted-foreground">
            {enrichedScore === null || enrichedScore === 0
              ? "Complète ton profil détaillé pour obtenir un plan encore plus personnalisé."
              : enrichedScore < 40
              ? "Ton profil est encore très partiel — quelques minutes suffisent à l'améliorer."
              : enrichedScore < 70
              ? "Bon début ! Quelques infos supplémentaires rendraient le plan encore meilleur."
              : enrichedScore < 90
              ? "Profil bien renseigné. Plus que quelques détails pour un plan optimal."
              : "Profil très complet ! 🎉 Tu peux toujours l'ajuster si besoin."}
          </p>
          <Button onClick={() => navigate("/onboarding/enriched")} variant={enrichedScore !== null && enrichedScore >= 90 ? "outline" : "default"} className="mt-2">
            {enrichedScore !== null && enrichedScore >= 90 ? "Revoir mon profil" : "Affiner mon profil"}
          </Button>
        </div>
      </div>
    </div>
  );
}

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

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span>{value || "—"}</span>
    </>
  );
}

const METRIC_TYPES = ["hr_max", "hr_rest", "ftp", "threshold_pace_run", "css", "pace_100m_max", "pace_100m_easy", "weight"];

function computeEnrichedCompleteness(enriched: any, metrics: Record<string, any>) {
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
    ...METRIC_TYPES.map((t) => ({ label: t, filled: !!metrics[t] })),
    { label: "Contraintes / limites", filled: !!enriched.injuries_constraints },
    { label: "Max séances/sem", filled: !!enriched.max_sessions_per_week },
    { label: "Ce qui fait rater le plan", filled: !!enriched.plan_failure_reason },
  ];
  return items;
}
