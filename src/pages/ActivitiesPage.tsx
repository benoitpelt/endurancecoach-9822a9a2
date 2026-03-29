import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, HelpCircle, Dumbbell, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const SPORT_EMOJI: Record<string, string> = {
  swim: "🏊", bike: "🚴", run: "🏃", strength: "💪", mobility: "🧘", walk: "🚶",
};
const SPORT_LABELS: Record<string, string> = {
  swim: "Natation", bike: "Vélo", run: "Course à pied", strength: "Renforcement", walk: "Marche",
};

const CONFORMITY_STYLES: Record<string, { label: string; icon: any; classes: string }> = {
  conform: { label: "Conforme", icon: CheckCircle2, classes: "text-accent bg-accent/10" },
  partial: { label: "Partielle", icon: AlertTriangle, classes: "text-warning bg-warning/10" },
  non_conform: { label: "Non conforme", icon: AlertTriangle, classes: "text-destructive bg-destructive/10" },
  free_workout: { label: "Séance libre", icon: Dumbbell, classes: "text-primary bg-primary/10" },
  pending: { label: "En attente", icon: HelpCircle, classes: "text-muted-foreground bg-muted" },
  ignored: { label: "Non exploité", icon: HelpCircle, classes: "text-muted-foreground bg-muted" },
};

type CompletedWorkout = {
  id: string;
  sport_type: string;
  matching_status: string;
  conformity_status: string;
  start_date: string | null;
  activity_name: string | null;
  duration_seconds: number | null;
  moving_time_seconds: number | null;
  distance_meters: number | null;
  short_analysis: string | null;
  requires_adjustment_review: boolean;
  planned_workout_id: string | null;
};

export default function ActivitiesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activities, setActivities] = useState<CompletedWorkout[]>([]);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [hasStrava, setHasStrava] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Check strava connection (via edge function status)
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (token) {
        const res = await supabase.functions.invoke("strava-auth", {
          headers: { Authorization: `Bearer ${token}` },
          body: { action: "status" },
        });
        setHasStrava(res.data?.connected || false);
      }

      // Load completed workouts
      const { data, error } = await supabase
        .from("completed_workouts")
        .select("*")
        .eq("user_id", user!.id)
        .order("start_date", { ascending: false })
        .limit(50);

      if (error) throw error;
      setActivities((data || []) as CompletedWorkout[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const syncActivities = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Session expirée.");

      const res = await supabase.functions.invoke("sync-new-activities", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || "Erreur de synchronisation.");
      }

      setSyncResult(res.data);
      if (res.data?.new_activities > 0) {
        toast.success(`${res.data.new_activities} nouvelle(s) activité(s) synchronisée(s) !`);
      } else {
        toast.info("Aucune nouvelle activité trouvée.");
      }
      await loadData();
    } catch (e: any) {
      toast.error(e.message || "Erreur de synchronisation.");
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "EEEE d MMM", { locale: fr }); } catch { return d; }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const min = Math.round(seconds / 60);
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
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
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/plan")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Retour au plan
        </Button>

        {/* Header */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-heading font-bold">Mes activités</h1>
              <p className="text-sm text-muted-foreground">
                Séances réalisées et synchronisées depuis Strava.
              </p>
            </div>
            {hasStrava && (
              <Button
                onClick={syncActivities}
                disabled={syncing}
                size="sm"
                className="gap-2"
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {syncing ? "Sync…" : "Synchroniser"}
              </Button>
            )}
          </div>
        </div>

        {/* Sync result */}
        {syncResult && syncResult.new_activities > 0 && (
          <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium">{syncResult.message}</span>
            </div>
            {syncResult.vigilance_signals?.length > 0 && (
              <div className="space-y-1 pt-1">
                {syncResult.vigilance_signals.map((s: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-warning">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* No strava */}
        {!hasStrava && activities.length === 0 && (
          <div className="bg-card rounded-xl shadow-card p-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Dumbbell className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-heading font-semibold">Aucune activité</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Connecte Strava pour synchroniser tes activités et voir comment elles se comparent à ton plan.
            </p>
            <Button onClick={() => navigate("/strava")} className="gap-2">
              Connecter Strava
            </Button>
          </div>
        )}

        {/* Empty state with strava */}
        {hasStrava && activities.length === 0 && (
          <div className="bg-card rounded-xl shadow-card p-8 text-center space-y-4">
            <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-heading font-semibold">Aucune activité récente</h2>
            <p className="text-sm text-muted-foreground">
              Synchronise tes dernières activités Strava pour commencer le suivi.
            </p>
            <Button onClick={syncActivities} disabled={syncing} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Synchroniser mes activités
            </Button>
          </div>
        )}

        {/* Activity list */}
        {activities.length > 0 && (
          <div className="space-y-2">
            {activities.map((act) => {
              const conf = CONFORMITY_STYLES[act.conformity_status] || CONFORMITY_STYLES.pending;
              const ConfIcon = conf.icon;
              const durStr = formatDuration(act.moving_time_seconds || act.duration_seconds);
              const distKm = act.distance_meters ? Math.round(Number(act.distance_meters) / 1000 * 10) / 10 : null;

              return (
                <button
                  key={act.id}
                  onClick={() => navigate(`/activities/${act.id}`)}
                  className="w-full text-left bg-card rounded-lg shadow-card p-4 hover:shadow-elevated transition-shadow"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-2xl flex-shrink-0">
                        {SPORT_EMOJI[act.sport_type] || "🏋️"}
                      </span>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-heading font-semibold text-sm">
                            {act.activity_name || SPORT_LABELS[act.sport_type] || act.sport_type}
                          </span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${conf.classes}`}>
                            <ConfIcon className="h-2.5 w-2.5" />
                            {conf.label}
                          </span>
                          {act.requires_adjustment_review && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30">
                              ⚠️ Vigilance
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDate(act.start_date)}
                          {durStr && ` · ${durStr}`}
                          {distKm && ` · ${distKm} km`}
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
