import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Target, TrendingUp, AlertTriangle, RefreshCw, CheckCircle, XCircle, History } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  on_track: { label: "En bonne voie", color: "text-accent", bg: "bg-accent/10" },
  watch: { label: "À surveiller", color: "text-warning", bg: "bg-warning/10" },
  ambitious: { label: "Ambitieux", color: "text-warning", bg: "bg-warning/10" },
  fragile: { label: "Fragile", color: "text-destructive", bg: "bg-destructive/10" },
};

const SPORT_LABELS: Record<string, string> = {
  swim: "🏊 Natation", bike: "🚴 Vélo", run: "🏃 Course à pied",
  strength: "💪 Renforcement", mobility: "🧘 Mobilité",
};

export default function TrajectoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [goal, setGoal] = useState<any>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: goalData } = await supabase
        .from("race_goals")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setGoal(goalData);

      if (goalData?.target_date) {
        const days = Math.ceil((new Date(goalData.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        setDaysRemaining(days);
      }

      if (goalData) {
        const { data: snapshots } = await supabase
          .from("goal_trajectory_snapshots")
          .select("*")
          .eq("user_id", user!.id)
          .eq("goal_id", goalData.id)
          .order("created_at", { ascending: false })
          .limit(20);

        if (snapshots && snapshots.length > 0) {
          setLatestSnapshot(snapshots[0]);
          setHistory(snapshots);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const computeTrajectory = async () => {
    setComputing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Session expirée");

      const res = await supabase.functions.invoke("compute-trajectory", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.error) throw new Error(typeof res.error === "object" && "message" in res.error ? (res.error as any).message : String(res.error));
      if (res.data?.error) throw new Error(res.data.error);

      toast.success("Trajectoire mise à jour !");
      await loadData();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors du calcul");
    } finally {
      setComputing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
          <div className="bg-card rounded-xl shadow-card p-8 text-center space-y-3">
            <Target className="h-10 w-10 text-muted-foreground mx-auto" />
            <h1 className="text-xl font-heading font-bold">Aucun objectif défini</h1>
            <p className="text-sm text-muted-foreground">Définis d'abord un objectif pour pouvoir suivre ta trajectoire.</p>
            <Button onClick={() => navigate("/onboarding/goal")}>Définir un objectif</Button>
          </div>
        </div>
      </div>
    );
  }

  const config = latestSnapshot ? (STATUS_CONFIG[latestSnapshot.trajectory_status] || STATUS_CONFIG.watch) : null;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>

        {/* Goal summary */}
        <div className="bg-card rounded-xl shadow-card p-6">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-heading font-bold">Objectif & Trajectoire</h1>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm mt-3">
            <div>
              <span className="text-muted-foreground">Objectif</span>
              <p className="font-medium">{goal.event_name || goal.format || goal.goal_type}</p>
            </div>
            {goal.target_date && (
              <div>
                <span className="text-muted-foreground">Date cible</span>
                <p className="font-medium">{format(new Date(goal.target_date), "d MMM yyyy", { locale: fr })}</p>
              </div>
            )}
            {daysRemaining !== null && (
              <div>
                <span className="text-muted-foreground">Temps restant</span>
                <p className="font-medium">{daysRemaining > 0 ? `${daysRemaining} jours` : "Imminent"}</p>
              </div>
            )}
            {goal.target_time && (
              <div>
                <span className="text-muted-foreground">Temps cible</span>
                <p className="font-medium">{goal.target_time}</p>
              </div>
            )}
          </div>
        </div>

        {/* Main trajectory */}
        {latestSnapshot && config ? (
          <div className="space-y-4">
            {/* Score + status */}
            <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-heading font-semibold">Trajectoire actuelle</h2>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(latestSnapshot.created_at), "d MMM à HH:mm", { locale: fr })}
                </span>
              </div>

              <div className="flex items-center gap-6">
                <div className="relative w-20 h-20 flex-shrink-0">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                    <circle
                      cx="40" cy="40" r="34" fill="none"
                      stroke="currentColor" strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${(latestSnapshot.realism_score_percent / 100) * 213.6} 213.6`}
                      className={config.color}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-heading font-bold">
                    {latestSnapshot.realism_score_percent}%
                  </span>
                </div>
                <div>
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.color}`}>
                    {latestSnapshot.trajectory_status === "on_track" ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    {config.label}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{latestSnapshot.summary_short}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground italic">
                Ce pourcentage est une estimation indicative, pas une prédiction exacte.
              </p>
            </div>

            {/* Detailed explanation */}
            {latestSnapshot.summary_detailed && (
              <div className="bg-card rounded-xl shadow-card p-6">
                <h3 className="font-heading font-semibold mb-2">Analyse détaillée</h3>
                <p className="text-sm text-muted-foreground">{latestSnapshot.summary_detailed}</p>
              </div>
            )}

            {/* Supporting / weakening points */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {latestSnapshot.supporting_points && (latestSnapshot.supporting_points as string[]).length > 0 && (
                <div className="bg-card rounded-xl shadow-card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-4 w-4 text-accent" />
                    <h3 className="font-heading font-semibold text-sm">Ce qui soutient</h3>
                  </div>
                  <ul className="space-y-2">
                    {(latestSnapshot.supporting_points as string[]).map((p: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-accent mt-0.5">✓</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {latestSnapshot.weakening_points && (latestSnapshot.weakening_points as string[]).length > 0 && (
                <div className="bg-card rounded-xl shadow-card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <XCircle className="h-4 w-4 text-warning" />
                    <h3 className="font-heading font-semibold text-sm">Ce qui fragilise</h3>
                  </div>
                  <ul className="space-y-2">
                    {(latestSnapshot.weakening_points as string[]).map((p: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-warning mt-0.5">⚠</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Discipline breakdown */}
            {latestSnapshot.discipline_breakdown && Object.keys(latestSnapshot.discipline_breakdown as Record<string, any>).length > 0 && (
              <div className="bg-card rounded-xl shadow-card p-5">
                <h3 className="font-heading font-semibold text-sm mb-3">Par discipline</h3>
                <div className="space-y-3">
                  {Object.entries(latestSnapshot.discipline_breakdown as Record<string, any>).map(([sport, data]: [string, any]) => {
                    const sc = STATUS_CONFIG[data.status] || STATUS_CONFIG.watch;
                    return (
                      <div key={sport} className="flex items-center justify-between">
                        <span className="text-sm">{SPORT_LABELS[sport] || sport}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>{sc.label}</span>
                          {data.note && <span className="text-xs text-muted-foreground max-w-[200px] truncate">{data.note}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Plan review suggestion */}
            {latestSnapshot.suggests_plan_review && (
              <div className="bg-warning/10 border border-warning/30 rounded-xl p-5 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-heading font-semibold text-sm">Une revue du plan pourrait être utile</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Les signaux récents suggèrent qu'une adaptation du plan serait bénéfique. Tu peux ajuster ta semaine en cours ou recalibrer tes prochaines séances.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => navigate("/plan")}>Voir mon plan</Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/strava")}>Recalibrer</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-xl shadow-card p-8 text-center space-y-3">
            <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="font-heading font-semibold">Pas encore de trajectoire calculée</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Lance un premier calcul pour voir où tu en es par rapport à ton objectif.
            </p>
          </div>
        )}

        {/* Compute button */}
        <div className="flex justify-center">
          <Button onClick={computeTrajectory} disabled={computing} className="gap-2">
            {computing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {computing ? "Calcul en cours…" : latestSnapshot ? "Recalculer la trajectoire" : "Calculer ma trajectoire"}
          </Button>
        </div>

        {/* History */}
        {history.length > 1 && (
          <div className="bg-card rounded-xl shadow-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <History className="h-4 w-4 text-primary" />
              <h3 className="font-heading font-semibold">Historique</h3>
            </div>
            <div className="space-y-3">
              {history.map((s, i) => {
                const sc = STATUS_CONFIG[s.trajectory_status] || STATUS_CONFIG.watch;
                return (
                  <div key={s.id} className={`flex items-center justify-between py-2 ${i > 0 ? "border-t border-border" : ""}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${sc.color === "text-accent" ? "bg-accent" : sc.color === "text-destructive" ? "bg-destructive" : "bg-warning"}`} />
                      <div>
                        <span className="text-sm font-medium">{s.realism_score_percent}%</span>
                        <span className={`ml-2 text-xs ${sc.color}`}>{sc.label}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(s.created_at), "d MMM yyyy", { locale: fr })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
