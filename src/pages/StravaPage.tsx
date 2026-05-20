import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Link2, Unlink, Activity, TrendingUp, BarChart3, Clock, Sparkles, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

type ConnectionStatus = {
  connected: boolean;
  connection: {
    connected_at: string;
    import_status: string;
    last_import_at: string | null;
    import_activity_count: number;
    strava_athlete_id: number | null;
  } | null;
};

type Synthesis = {
  period_months: number;
  total_activities: number;
  recent_activities: number;
  overall_weekly_hours_6m: number;
  overall_weekly_hours_3m: number;
  weekly_frequency: number;
  regularity_pct: number;
  active_weeks: number;
  total_weeks: number;
  trend: string;
  sport_summaries: Record<string, {
    count_total: number;
    count_recent: number;
    weekly_frequency: number;
    weekly_volume_hours: number;
    recent_weekly_volume_hours: number;
    total_distance_km: number;
    longest_session_min: number;
    longest_session_km: number;
    longest_session_name: string;
  }>;
  confirmed: string[];
  uncertain: string[];
  impacts: string[];
  has_existing_plan: boolean;
  existing_plan: { id: string; name: string; status: string } | null;
};

type PageState =
  | "loading"
  | "not_connected"
  | "exchanging"
  | "connected_no_import"
  | "ready_to_import"
  | "importing"
  | "import_success"
  | "import_partial"
  | "import_error"
  | "import_empty"
  | "synthesis"
  | "decision";

const SPORT_LABELS: Record<string, string> = {
  swim: "Natation", bike: "Vélo", run: "Course à pied",
};
const SPORT_EMOJI: Record<string, string> = {
  swim: "🏊", bike: "🚴", run: "🏃",
};
const TREND_LABELS: Record<string, string> = {
  ascending: "📈 En hausse",
  stable: "➡️ Stable",
  descending: "📉 En baisse",
};

export default function StravaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [synthesis, setSynthesis] = useState<Synthesis | null>(null);
  const [importResult, setImportResult] = useState<{ count: number; total: number; fallback: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [recalibrating, setRecalibrating] = useState(false);
  const [backfillState, setBackfillState] = useState<{
    running: boolean;
    processed: number;
    total: number;
    errors: number;
    rateLimited: boolean;
    done: boolean;
  } | null>(null);
  const processedCodeRef = useRef<string | null>(null);
  const exchangeInFlightRef = useRef(false);

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token;
  };

  const loadStatus = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await supabase.functions.invoke("strava-auth", {
        headers: { Authorization: `Bearer ${token}` },
        body: { action: "status" },
      });
      if (res.error) throw res.error;
      const data = res.data as ConnectionStatus;
      setConnectionStatus(data);

      if (!data.connected) {
        setPageState("not_connected");
      } else if (data.connection?.import_status === "success" || data.connection?.import_status === "partial") {
        // Load synthesis
        await loadSynthesis(token);
      } else if (data.connection?.import_status === "importing") {
        setPageState("importing");
      } else if (data.connection?.import_status === "error") {
        setPageState("import_error");
      } else if (data.connection?.import_status === "empty") {
        setPageState("import_empty");
      } else {
        setPageState("connected_no_import");
      }
    } catch (e: any) {
      console.error(e);
      setError("Impossible de vérifier la connexion Strava.");
      setPageState("not_connected");
    }
  }, []);

  const loadSynthesis = async (token: string) => {
    try {
      const res = await supabase.functions.invoke("strava-synthesis", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw res.error;
      if (res.data?.synthesis) {
        setSynthesis(res.data.synthesis);
        setPageState("synthesis");
      } else {
        setPageState("import_empty");
      }
    } catch (e) {
      console.error(e);
      setPageState("connected_no_import");
    }
  };

  // Handle OAuth callback
  useEffect(() => {
    const code = searchParams.get("code");
    if (code && user && processedCodeRef.current !== code && !exchangeInFlightRef.current) {
      setPageState("exchanging");
      handleOAuthCallback(code);
    }
  }, [searchParams, user]);

  useEffect(() => {
    if (user && !searchParams.get("code")) {
      loadStatus();
    }
  }, [user, loadStatus, searchParams]);

  useEffect(() => {
    if (!user) return;

    const refreshStatus = () => {
      if (document.visibilityState === "visible" && !searchParams.get("code")) {
        loadStatus();
      }
    };

    window.addEventListener("focus", refreshStatus);
    document.addEventListener("visibilitychange", refreshStatus);

    return () => {
      window.removeEventListener("focus", refreshStatus);
      document.removeEventListener("visibilitychange", refreshStatus);
    };
  }, [user, loadStatus, searchParams]);

  const handleOAuthCallback = async (code: string) => {
    if (exchangeInFlightRef.current || processedCodeRef.current === code) return;

    try {
      exchangeInFlightRef.current = true;
      processedCodeRef.current = code;
      const token = await getToken();
      if (!token) throw new Error("Session expirée.");
      const res = await supabase.functions.invoke("strava-auth", {
        headers: { Authorization: `Bearer ${token}` },
        body: { action: "exchange", code },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || "Erreur de connexion.");
      toast.success("Connexion Strava réussie !");
      // Remove code from URL
      setSearchParams({});
      setPageState("connected_no_import");
      await loadStatus();
    } catch (e: any) {
      console.error(e);
      const message = typeof e?.message === "string" && e.message.includes("AuthorizationCode")
        ? "Le code de connexion Strava a déjà été utilisé. Réessaie la connexion."
        : e.message || "Erreur lors de la connexion Strava.";
      setError(message);
      setPageState("not_connected");
      setSearchParams({});
    } finally {
      exchangeInFlightRef.current = false;
    }
  };

  const connectStrava = async () => {
    try {
      setError(null);

      const token = await getToken();
      const res = await supabase.functions.invoke("strava-auth", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: { action: "get_client_id" },
      });
      const clientId = res.data?.client_id;
      if (!clientId) throw new Error("Configuration Strava manquante.");

      const redirectUri = `${window.location.origin}/strava`;
      const scope = "read,activity:read_all";
      const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&approval_prompt=auto`;

      window.location.assign(url);
    } catch (e) {
      console.error(e);
      toast.error("Impossible d'initier la connexion Strava.");
    }
  };

  const disconnectStrava = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      await supabase.functions.invoke("strava-auth", {
        headers: { Authorization: `Bearer ${token}` },
        body: { action: "disconnect" },
      });
      toast.success("Strava déconnecté.");
      setConnectionStatus(null);
      setSynthesis(null);
      setPageState("not_connected");
    } catch (e: any) {
      toast.error("Erreur lors de la déconnexion.");
    }
  };

  const launchImport = async () => {
    try {
      setPageState("importing");
      setError(null);
      const token = await getToken();
      if (!token) throw new Error("Session expirée.");
      const res = await supabase.functions.invoke("strava-import", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || "Erreur d'import.");
      const data = res.data;
      setImportResult({ count: data.count, total: data.total, fallback: data.fallback });

      if (data.count === 0) {
        setPageState("import_empty");
      } else if (data.status === "partial") {
        setPageState("import_partial");
      } else {
        setPageState("import_success");
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erreur lors de l'import.");
      setPageState("import_error");
    }
  };

  const viewSynthesis = async () => {
    const token = await getToken();
    if (token) await loadSynthesis(token);
  };

  const recalibrateWorkouts = async () => {
    try {
      setRecalibrating(true);
      const token = await getToken();
      if (!token) throw new Error("Session expirée.");
      const res = await supabase.functions.invoke("recalibrate-workouts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(`${res.data.recalibrated_count} séance(s) recalibrée(s) avec succès !`);
      navigate("/plan");
    } catch (e: any) {
      toast.error(e.message || "Erreur lors du recalibrage.");
    } finally {
      setRecalibrating(false);
    }
  };

  const regeneratePlan = async () => {
    try {
      setRegenerating(true);
      const token = await getToken();
      if (!token) throw new Error("Session expirée.");
      const res = await supabase.functions.invoke("generate-training-plan", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      toast.success("Plan régénéré avec succès !");
      navigate("/plan");
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la régénération.");
    } finally {
      setRegenerating(false);
    }
  };

  const runBackfill = async () => {
    try {
      setBackfillState({ running: true, processed: 0, total: 0, errors: 0, rateLimited: false, done: false });
      let totalProcessed = 0;
      let totalErrors = 0;
      let total = 0;

      // Boucle : on rappelle tant qu'il reste des activités à enrichir
      for (let i = 0; i < 50; i++) {
        const token = await getToken();
        if (!token) throw new Error("Session expirée.");
        const res = await supabase.functions.invoke("strava-backfill-details", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.error || res.data?.error) throw new Error(res.data?.error || "Erreur d'enrichissement.");
        const data = res.data;
        totalProcessed += data.processed || 0;
        totalErrors += data.errors || 0;
        if (i === 0) total = (data.total_before || 0);

        setBackfillState({
          running: !data.done && !data.rate_limited,
          processed: totalProcessed,
          total,
          errors: totalErrors,
          rateLimited: !!data.rate_limited,
          done: !!data.done,
        });

        if (data.done) {
          toast.success(`Enrichissement terminé : ${totalProcessed} activité(s) détaillée(s).`);
          break;
        }
        if (data.rate_limited) {
          toast.info("Limite Strava atteinte. Relance dans 15 min pour continuer.");
          break;
        }
        // Petit délai entre lots pour soulager Strava
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erreur lors de l'enrichissement.");
      setBackfillState(prev => prev ? { ...prev, running: false } : null);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "d MMM yyyy à HH:mm", { locale: fr }); } catch { return d; }
  };

  if (pageState === "loading" || pageState === "exchanging") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">
          {pageState === "exchanging" ? "Connexion à Strava en cours…" : "Chargement…"}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/plan")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>

        {/* Header */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-[#FC4C02]/10 flex items-center justify-center">
              <Activity className="h-6 w-6 text-[#FC4C02]" />
            </div>
            <div>
              <h1 className="text-2xl font-heading font-bold">Strava</h1>
              <p className="text-sm text-muted-foreground">
                {connectionStatus?.connected ? "Connecté" : "Non connecté"}
              </p>
            </div>
          </div>

          {connectionStatus?.connected && connectionStatus.connection && (
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
              <p>Connecté le {formatDate(connectionStatus.connection.connected_at)}</p>
              {connectionStatus.connection.last_import_at && (
                <p>Dernier import : {formatDate(connectionStatus.connection.last_import_at)} ({connectionStatus.connection.import_activity_count} activités)</p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-lg p-4">
            <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Not connected */}
        {pageState === "not_connected" && (
          <div className="bg-card rounded-xl shadow-card p-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-[#FC4C02]/10 flex items-center justify-center">
              <Link2 className="h-8 w-8 text-[#FC4C02]" />
            </div>
            <h2 className="text-xl font-heading font-semibold">Connecte ton compte Strava</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              En connectant Strava, tu nous permets d'accéder à ton historique d'entraînement pour mieux personnaliser ton plan. 
              Nous ne publierons jamais rien sur ton compte.
            </p>
            <Button onClick={connectStrava} className="gap-2 bg-[#FC4C02] hover:bg-[#FC4C02]/90">
              <Activity className="h-4 w-4" />
              Connecter Strava
            </Button>
          </div>
        )}

        {/* Connected, no import yet */}
        {(pageState === "connected_no_import" || pageState === "ready_to_import") && (
          <div className="bg-card rounded-xl shadow-card p-8 space-y-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-[#FC4C02]" />
              <h2 className="text-xl font-heading font-semibold">Connexion réussie !</h2>
            </div>
            <div className="bg-gradient-subtle rounded-lg p-4 space-y-2">
              <h3 className="font-heading font-semibold text-sm">Que va faire l'import ?</h3>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  Récupérer tes <strong>6 derniers mois</strong> d'activités
                </li>
                <li className="flex items-start gap-2">
                  <BarChart3 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  Analyser tes volumes, fréquences et séances longues
                </li>
                <li className="flex items-start gap-2">
                  <TrendingUp className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  Enrichir ton profil pour un plan plus fiable
                </li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                Seules les données utiles au coaching sont exploitées (natation, vélo, course).
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={launchImport} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Lancer l'import
              </Button>
              <Button variant="outline" onClick={() => navigate("/plan")}>
                Revenir plus tard
              </Button>
            </div>
          </div>
        )}

        {/* Importing */}
        {pageState === "importing" && (
          <div className="bg-card rounded-xl shadow-card p-8 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-[#FC4C02] mx-auto" />
            <h2 className="text-xl font-heading font-semibold">Import en cours…</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Récupération de tes activités Strava. Cela peut prendre quelques secondes selon la taille de ton historique.
            </p>
          </div>
        )}

        {/* Import success */}
        {(pageState === "import_success" || pageState === "import_partial") && importResult && (
          <div className="bg-card rounded-xl shadow-card p-8 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-accent" />
              <h2 className="text-xl font-heading font-semibold">
                {pageState === "import_success" ? "Import réussi !" : "Import partiel"}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              {importResult.count} activité{importResult.count > 1 ? "s" : ""} importée{importResult.count > 1 ? "s" : ""}
              {importResult.fallback && " (sur les 3 derniers mois)"}
              {!importResult.fallback && " (sur les 6 derniers mois)"}
              .
            </p>
            {pageState === "import_partial" && (
              <div className="flex items-start gap-2 bg-warning/10 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Certaines activités n'ont pas pu être importées ({importResult.count}/{importResult.total}). La synthèse sera basée sur les données disponibles.
                </p>
              </div>
            )}
            <Button onClick={viewSynthesis} className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Voir la synthèse
            </Button>
          </div>
        )}

        {/* Import empty */}
        {pageState === "import_empty" && (
          <div className="bg-card rounded-xl shadow-card p-8 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-warning mx-auto" />
            <h2 className="text-xl font-heading font-semibold">Aucune activité trouvée</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Nous n'avons trouvé aucune activité pertinente sur les 6 derniers mois. Assure-toi que tes activités sont publiques ou visibles par les applications connectées.
            </p>
            <Button variant="outline" onClick={() => navigate("/plan")}>
              Retour au plan
            </Button>
          </div>
        )}

        {/* Import error */}
        {pageState === "import_error" && (
          <div className="bg-card rounded-xl shadow-card p-8 text-center space-y-4">
            <XCircle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-xl font-heading font-semibold">Erreur d'import</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {error || "Un problème est survenu lors de l'import. Tu peux réessayer."}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={launchImport} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Réessayer
              </Button>
              <Button variant="outline" onClick={() => navigate("/plan")}>
                Revenir plus tard
              </Button>
            </div>
          </div>
        )}

        {/* Synthesis */}
        {pageState === "synthesis" && synthesis && (
          <>
            <div className="bg-card rounded-xl shadow-card p-6 space-y-5">
              <h2 className="text-xl font-heading font-bold flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Synthèse de ton historique
              </h2>

              {/* Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Activités" value={String(synthesis.total_activities)} />
                <StatCard label="Volume/sem" value={`${synthesis.overall_weekly_hours_6m}h`} />
                <StatCard label="Fréquence/sem" value={`${synthesis.weekly_frequency}`} />
                <StatCard label="Régularité" value={`${synthesis.regularity_pct}%`} />
              </div>

              {/* Trend */}
              <div className="bg-gradient-subtle rounded-lg p-3 flex items-center gap-2">
                <span className="text-sm font-heading font-semibold">Tendance récente :</span>
                <span className="text-sm text-muted-foreground">{TREND_LABELS[synthesis.trend] || synthesis.trend}</span>
              </div>

              {/* Sport breakdown */}
              <div className="space-y-3">
                <h3 className="font-heading font-semibold text-sm">Par discipline</h3>
                {["swim", "bike", "run"].map((sport) => {
                  const s = synthesis.sport_summaries[sport];
                  if (!s) return null;
                  return (
                    <div key={sport} className="bg-secondary/50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{SPORT_EMOJI[sport]}</span>
                        <span className="font-heading font-semibold text-sm">{SPORT_LABELS[sport]}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{s.count_total} séances</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>Fréquence : {s.weekly_frequency}/sem</span>
                        <span>Volume : {s.weekly_volume_hours}h/sem</span>
                        <span>Distance totale : {s.total_distance_km} km</span>
                        <span>Plus longue : {s.longest_session_min} min ({s.longest_session_km} km)</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Confirmed points */}
              {synthesis.confirmed.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-heading font-semibold text-sm text-accent flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Points confirmés
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {synthesis.confirmed.map((p, i) => <li key={i}>• {p}</li>)}
                  </ul>
                </div>
              )}

              {/* Uncertain points */}
              {synthesis.uncertain.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-heading font-semibold text-sm text-warning flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" /> Points incertains
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {synthesis.uncertain.map((p, i) => <li key={i}>• {p}</li>)}
                  </ul>
                </div>
              )}

              {/* Impacts */}
              {synthesis.impacts.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-heading font-semibold text-sm">Impact sur ton profil</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {synthesis.impacts.map((p, i) => <li key={i}>✅ {p}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* Decision block */}
            {synthesis.has_existing_plan && (
              <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
                <h2 className="text-lg font-heading font-bold">Que faire de ton plan ?</h2>
                <p className="text-sm text-muted-foreground">
                  Ton profil a été enrichi avec les données Strava. Tu disposes maintenant d'une base plus fiable pour ajuster tes prochaines séances.
                </p>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button variant="outline" onClick={() => navigate("/plan")} className="gap-2">
                      <ChevronRight className="h-4 w-4" />
                      Garder mon plan actuel
                    </Button>
                    <Button
                      onClick={recalibrateWorkouts}
                      disabled={recalibrating || regenerating}
                      className="gap-2"
                    >
                      {recalibrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {recalibrating ? "Recalibrage en cours…" : "Recalibrer mes prochaines séances"}
                    </Button>
                  </div>
                  {recalibrating && (
                    <p className="text-xs text-muted-foreground animate-pulse">
                      Le coach ajuste tes prochaines séances avec les nouvelles données Strava…
                    </p>
                  )}
                  <div className="border-t border-border pt-3 mt-1">
                    <p className="text-xs text-muted-foreground mb-2">
                      Le recalibrage ajuste le contenu de tes séances futures (allures, distances, volumes) sans modifier la structure de ton plan.
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={regeneratePlan}
                      disabled={regenerating || recalibrating}
                      className="gap-2 text-xs text-muted-foreground"
                    >
                      {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {regenerating ? "Régénération complète…" : "Régénérer complètement mon plan (action lourde)"}
                    </Button>
                    {regenerating && (
                      <p className="text-xs text-destructive/70 animate-pulse mt-1">
                        Attention : cette action reconstruit entièrement ton plan. Les blocs et semaines seront recréés.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!synthesis.has_existing_plan && (
              <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
                <h2 className="text-lg font-heading font-bold">Prêt à générer ton plan ?</h2>
                <p className="text-sm text-muted-foreground">
                  Ton profil est enrichi avec tes données Strava. Tu peux maintenant générer un plan personnalisé.
                </p>
                <Button onClick={() => navigate("/plan")} className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Aller générer mon plan
                </Button>
              </div>
            )}
          </>
        )}

        {/* Connected actions: disconnect + reimport */}
        {connectionStatus?.connected && pageState !== "importing" && (
          <div className="bg-card rounded-xl shadow-card p-4 flex flex-wrap gap-3">
            {(connectionStatus.connection?.import_status === "success" || connectionStatus.connection?.import_status === "partial") && (
              <Button variant="outline" size="sm" onClick={launchImport} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5" />
                Réimporter mon historique
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={disconnectStrava} className="gap-2 text-destructive hover:text-destructive">
              <Unlink className="h-3.5 w-3.5" />
              Déconnecter Strava
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/50 rounded-lg p-3 text-center">
      <p className="text-lg font-heading font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
