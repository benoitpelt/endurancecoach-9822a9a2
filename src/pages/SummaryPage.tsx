import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Loader2, User, Target, Calendar, LogOut, Pencil, Layers,
  ChevronRight, Activity, ArrowRight,
} from "lucide-react";

const DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SEX_LABELS: Record<string, string> = { male: "H", female: "F", other: "Autre", prefer_not_to_say: "—" };
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

  const availableDays = availability.filter((a) => a.is_available).length;
  const daysRemaining = goal?.target_date
    ? Math.max(0, Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="min-h-screen py-6 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Bonjour{profile?.display_name ? ` ${profile.display_name}` : ""} 👋</p>
            <h1 className="text-xl font-heading font-bold">Tableau de bord</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Primary CTA — Mon plan */}
        <button
          onClick={() => navigate("/plan")}
          className="w-full bg-primary text-primary-foreground rounded-xl p-4 flex items-center justify-between hover:opacity-90 transition-opacity active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <Layers className="h-5 w-5" />
            <div className="text-left">
              <p className="font-heading font-semibold">Mon plan d'entraînement</p>
              <p className="text-xs opacity-80">Semaines, séances & progression</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5" />
        </button>

        {/* Quick links row */}
        <div className="grid grid-cols-3 gap-3">
          <QuickCard
            icon={Activity}
            label="Activités"
            sub="Historique"
            onClick={() => navigate("/activities")}
          />
          <QuickCard
            icon={TrendingUp}
            label="Performance"
            sub="Records & IA"
            onClick={() => navigate("/performance")}
          />
          <QuickCard
            icon={Target}
            label="Trajectoire"
            sub="Réalisme"
            onClick={() => navigate("/trajectory")}
          />
        </div>

        {/* Goal summary — compact */}
        {goal && (
          <div className="bg-card rounded-xl shadow-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">
                  {goal.event_name || GOAL_TYPE_LABELS[goal.goal_type] || "Mon objectif"}
                  {goal.format ? ` — ${goal.format}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {goal.target_date ? `${goal.target_date}` : "Date non définie"}
                  {daysRemaining !== null ? ` · J-${daysRemaining}` : ""}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/onboarding/goal")}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Profile compact */}
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <h2 className="font-heading font-semibold text-sm">Profil</h2>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/onboarding/profile")}>
              <Pencil className="h-3 w-3 mr-1" /> Modifier
            </Button>
          </div>
          {profile ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {profile.display_name && <span>{profile.display_name}</span>}
              {profile.sex && <span>{SEX_LABELS[profile.sex]}</span>}
              {profile.weight_kg && <span>{profile.weight_kg} kg</span>}
              {profile.height_cm && <span>{profile.height_cm} cm</span>}
              {(profile.city || profile.country) && <span>{[profile.city, profile.country].filter(Boolean).join(", ")}</span>}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">Non renseigné</p>
          )}
        </div>

        {/* Availability compact */}
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <h2 className="font-heading font-semibold text-sm">Disponibilités</h2>
              {availability.length > 0 && (
                <span className="text-xs text-muted-foreground">· {availableDays}j/sem</span>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/onboarding/availability")}>
              <Pencil className="h-3 w-3 mr-1" /> Modifier
            </Button>
          </div>
          {availability.length > 0 ? (
            <div className="flex gap-1.5">
              {DAYS_SHORT.map((day, i) => {
                const rule = availability.find((a) => a.day_of_week === i);
                const active = rule?.is_available;
                return (
                  <div
                    key={day}
                    className={`flex-1 text-center py-1.5 rounded-md text-xs font-medium ${
                      active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/50"
                    }`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">Non renseignées</p>
          )}
        </div>

        {/* Enriched profile with score */}
        <div className="bg-card rounded-xl shadow-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-primary" />
              <h2 className="font-heading font-semibold text-sm">Profil enrichi</h2>
            </div>
            {enrichedScore !== null && (
              <span className={`text-sm font-bold ${enrichedScore >= 70 ? "text-accent" : enrichedScore >= 40 ? "text-primary" : "text-warning"}`}>
                {enrichedScore}%
              </span>
            )}
          </div>
          {enrichedScore !== null && <Progress value={enrichedScore} className="h-1.5" />}
          <p className="text-xs text-muted-foreground">
            {enrichedScore === null || enrichedScore === 0
              ? "Complète ton profil pour un plan plus personnalisé."
              : enrichedScore < 40
              ? "Profil très partiel — quelques minutes suffisent."
              : enrichedScore < 70
              ? "Bon début ! Quelques infos en plus aideraient."
              : enrichedScore < 90
              ? "Bien renseigné. Plus que quelques détails."
              : "Très complet ! 🎉"}
          </p>
          <Button
            onClick={() => navigate("/onboarding/enriched")}
            variant={enrichedScore !== null && enrichedScore >= 90 ? "outline" : "default"}
            size="sm"
            className="w-full text-xs h-8"
          >
            {enrichedScore !== null && enrichedScore >= 90 ? "Revoir" : "Affiner mon profil"}
          </Button>
        </div>

        {/* Strava link */}
        <button
          onClick={() => navigate("/strava")}
          className="w-full bg-card rounded-xl shadow-card p-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#FC4C02]/10 flex items-center justify-center">
              <span className="text-[#FC4C02] font-bold text-xs">S</span>
            </div>
            <div>
              <p className="font-medium text-sm">Strava</p>
              <p className="text-xs text-muted-foreground">Connecter & importer</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

function QuickCard({ icon: Icon, label, sub, onClick }: { icon: any; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-card rounded-xl shadow-card p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left w-full"
    >
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </button>
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
