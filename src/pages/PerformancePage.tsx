import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bike, Footprints, Waves, TrendingUp, TrendingDown, Minus, Sparkles, AlertTriangle, Lightbulb, RefreshCw, Info, Activity as ActivityIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { type Activity, PERIODS, computeBestEfforts, computeLoadSummary, type BestEffort } from "@/lib/performance";

const CACHE_HOURS = 7 * 24;

export default function PerformancePage() {
  const navigate = useNavigate();
  const [periodDays, setPeriodDays] = useState<number>(90);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<any | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsAge, setInsightsAge] = useState<number | null>(null); // heures

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("imported_activities")
        .select("id, sport_type_normalized, start_date, duration_seconds, moving_time_seconds, distance_meters, avg_heartrate, avg_power, avg_speed, elevation_gain_meters, name")
        .order("start_date", { ascending: false })
        .limit(500);
      if (error) toast.error("Impossible de charger les activités");
      setActivities(data ?? []);
      setLoading(false);
    })();
  }, []);

  // Charger insights cachés à chaque changement de période
  useEffect(() => {
    (async () => {
      setInsights(null); setInsightsAge(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("performance_insights")
        .select("*")
        .eq("user_id", user.id)
        .eq("period_days", periodDays)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        const ageH = (Date.now() - new Date(data.generated_at).getTime()) / 3600_000;
        setInsights({ insights: data.insights, vigilance: data.vigilance, recommendations: data.recommendations });
        setInsightsAge(ageH);
      }
    })();
  }, [periodDays]);

  const periodActs = useMemo(() => {
    if (!activities) return [];
    const cutoff = Date.now() - periodDays * 86400_000;
    return periodDays >= 99999 ? activities : activities.filter((a) => a.start_date && new Date(a.start_date).getTime() >= cutoff);
  }, [activities, periodDays]);

  const bests = useMemo(() => computeBestEfforts(periodActs), [periodActs]);
  const load = useMemo(() => computeLoadSummary(periodActs, periodDays), [periodActs, periodDays]);

  async function generateInsights(force = false) {
    if (!force && insights && insightsAge !== null && insightsAge < CACHE_HOURS) {
      toast.info("Insights récents disponibles. Force la régénération si besoin.");
      return;
    }
    setInsightsLoading(true);
    try {
      const dataSummary = {
        total_sessions: load.totalSessions,
        total_hours: Number(load.totalHours.toFixed(1)),
        weekly_avg_hours: Number(load.weeklyAvg.hours.toFixed(1)),
        weekly_avg_sessions: Number(load.weeklyAvg.sessions.toFixed(1)),
        by_sport_hours: {
          swim: Number(load.bySport.swim.toFixed(1)),
          bike: Number(load.bySport.bike.toFixed(1)),
          run: Number(load.bySport.run.toFixed(1)),
          other: Number(load.bySport.other.toFixed(1)),
        },
        trend: load.trend,
        last_weeks: load.weekly,
      };
      const { data, error } = await supabase.functions.invoke("generate-performance-insights", {
        body: { period_days: periodDays, dataSummary },
      });
      if (error) throw error;
      if (data?.error === "insufficient_data") {
        toast.error(data.message || "Données insuffisantes");
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setInsights({ insights: data.insights, vigilance: data.vigilance, recommendations: data.recommendations });
      setInsightsAge(0);
      toast.success("Insights générés");
    } catch (e: any) {
      toast.error(e.message || "Erreur de génération");
    } finally {
      setInsightsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading font-semibold text-lg">Performance</h1>
            <p className="text-xs text-muted-foreground">Analyse de tes données réelles</p>
          </div>
        </div>
        {/* Sélecteur période */}
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setPeriodDays(p.days)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                periodDays === p.days ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : periodActs.length === 0 ? (
          <Card className="p-6 text-center space-y-3">
            <Info className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium">Aucune activité sur cette période</p>
            <p className="text-sm text-muted-foreground">Élargis la période ou synchronise tes activités Strava.</p>
            <Button onClick={() => navigate("/activities")} variant="outline" size="sm">Voir mes activités</Button>
          </Card>
        ) : (
          <Tabs defaultValue="bests" className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="bests" className="text-xs">Records</TabsTrigger>
              <TabsTrigger value="load" className="text-xs">Charge</TabsTrigger>
              <TabsTrigger value="insights" className="text-xs">Insights IA</TabsTrigger>
            </TabsList>

            {/* ========== RECORDS ========== */}
            <TabsContent value="bests" className="space-y-3 mt-3">
              <Card className="p-3 bg-muted/30 border-dashed">
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Calculs prudents basés sur la moyenne d'activités dont la durée/distance correspond. Aucune donnée inventée.</span>
                </p>
              </Card>

              <BestSection icon={Bike} title="Vélo — Puissances" items={bests.cycling} />
              <BestSection icon={Footprints} title="Course à pied — Allures" items={bests.running} />
              <BestSection icon={Waves} title="Natation — Allures" items={bests.swimming} />
            </TabsContent>

            {/* ========== CHARGE ========== */}
            <TabsContent value="load" className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Séances" value={String(load.totalSessions)} sub={`${load.weeklyAvg.sessions.toFixed(1)}/sem`} />
                <StatCard label="Volume" value={`${load.totalHours.toFixed(1)} h`} sub={`${load.weeklyAvg.hours.toFixed(1)} h/sem`} />
              </div>

              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-semibold text-sm">Répartition par sport</h3>
                  <TrendBadge trend={load.trend} />
                </div>
                <SportBar swim={load.bySport.swim} bike={load.bySport.bike} run={load.bySport.run} other={load.bySport.other} />
                <div className="grid grid-cols-4 gap-2 text-xs text-center">
                  <SportLegend label="Nat" hours={load.bySport.swim} color="bg-blue-500" />
                  <SportLegend label="Vélo" hours={load.bySport.bike} color="bg-amber-500" />
                  <SportLegend label="CAP" hours={load.bySport.run} color="bg-emerald-500" />
                  <SportLegend label="Autre" hours={load.bySport.other} color="bg-muted-foreground" />
                </div>
              </Card>

              {load.weekly.length > 0 && (
                <Card className="p-4 space-y-3">
                  <h3 className="font-heading font-semibold text-sm">Volume hebdomadaire</h3>
                  <WeeklyBars weekly={load.weekly} />
                </Card>
              )}

              <Card className="p-4 space-y-3">
                <h3 className="font-heading font-semibold text-sm">Plus longues séances</h3>
                <LongestRow icon={Waves} label="Natation" act={load.longestBySport.swim} unit="m" />
                <LongestRow icon={Bike} label="Vélo" act={load.longestBySport.bike} unit="time" />
                <LongestRow icon={Footprints} label="CAP" act={load.longestBySport.run} unit="km" />
              </Card>
            </TabsContent>

            {/* ========== INSIGHTS IA ========== */}
            <TabsContent value="insights" className="space-y-3 mt-3">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-heading font-semibold text-sm">Lecture coaching IA</h3>
                      {insightsAge !== null && (
                        <p className="text-xs text-muted-foreground">
                          {insightsAge < 1 ? "À l'instant" : `Il y a ${Math.round(insightsAge)} h${insightsAge >= 24 ? ` · ${Math.round(insightsAge / 24)} j` : ""}`}
                          {insightsAge >= CACHE_HOURS && " · ancien"}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant={insights ? "outline" : "default"} onClick={() => generateInsights(true)} disabled={insightsLoading}>
                    {insightsLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                    {insights ? "Régénérer" : "Générer"}
                  </Button>
                </div>
                {!insights && !insightsLoading && (
                  <p className="text-xs text-muted-foreground">Génère une lecture coaching basée sur tes {periodActs.length} activités récentes.</p>
                )}
              </Card>

              {insights && (
                <>
                  <InsightBlock icon={Sparkles} title="Ce qui ressort" items={insights.insights} tone="primary" />
                  <InsightBlock icon={AlertTriangle} title="Points de vigilance" items={insights.vigilance} tone="warning" />
                  <InsightBlock icon={Lightbulb} title="Recommandations" items={insights.recommendations} tone="success" />
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

// ========== Sous-composants ==========

function BestSection({ icon: Icon, title, items }: { icon: any; title: string; items: BestEffort[] }) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-heading font-semibold text-sm">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.label} className={`rounded-lg p-3 ${it.insufficient ? "bg-muted/40" : "bg-muted/60"}`}>
            <p className="text-[11px] text-muted-foreground mb-0.5">{it.label}</p>
            {it.insufficient ? (
              <p className="text-xs italic text-muted-foreground">Données insuffisantes</p>
            ) : (
              <>
                <p className="font-heading font-semibold text-base">{it.formatted}</p>
                {it.date && <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(it.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>}
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading font-semibold text-2xl mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </Card>
  );
}

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" }) {
  const map = {
    up: { Icon: TrendingUp, label: "En hausse", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
    down: { Icon: TrendingDown, label: "En baisse", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    stable: { Icon: Minus, label: "Stable", cls: "bg-muted text-muted-foreground" },
  }[trend];
  return (
    <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${map.cls}`}>
      <map.Icon className="h-3 w-3" />
      <span>{map.label}</span>
    </div>
  );
}

function SportBar({ swim, bike, run, other }: { swim: number; bike: number; run: number; other: number }) {
  const total = Math.max(0.01, swim + bike + run + other);
  return (
    <div className="flex h-3 rounded-full overflow-hidden bg-muted">
      <div className="bg-blue-500" style={{ width: `${(swim / total) * 100}%` }} />
      <div className="bg-amber-500" style={{ width: `${(bike / total) * 100}%` }} />
      <div className="bg-emerald-500" style={{ width: `${(run / total) * 100}%` }} />
      <div className="bg-muted-foreground" style={{ width: `${(other / total) * 100}%` }} />
    </div>
  );
}

function SportLegend({ label, hours, color }: { label: string; hours: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <span className="font-medium">{label}</span>
      </div>
      <p className="text-muted-foreground mt-0.5">{hours.toFixed(1)} h</p>
    </div>
  );
}

function WeeklyBars({ weekly }: { weekly: { weekStart: string; sessions: number; hours: number; isCurrent?: boolean }[] }) {
  const maxH = Math.max(1, ...weekly.map((w) => w.hours));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>0 h</span>
        <span>Échelle max : {maxH.toFixed(1)} h</span>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex items-end gap-2 min-w-max h-32">
          {weekly.map((w) => {
            const height = w.hours > 0 ? Math.max(10, (w.hours / maxH) * 100) : 2;
            return (
              <div key={w.weekStart} className="w-10 h-full flex flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-medium tabular-nums">{w.hours.toFixed(1)}h</span>
                <div
                  className={`w-full rounded-t transition-colors ${w.isCurrent ? "bg-primary/50" : "bg-primary/85 hover:bg-primary"}`}
                  style={{ height: `${height}%` }}
                  title={`${w.hours.toFixed(1)} h · ${w.sessions} séances${w.isCurrent ? " · semaine en cours" : ""}`}
                />
                <span className="text-[9px] text-muted-foreground tabular-nums">
                  {new Date(`${w.weekStart}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LongestRow({ icon: Icon, label, act, unit }: { icon: any; label: string; act: Activity | null; unit: "km" | "m" | "time" }) {
  if (!act) return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">{label}</span></div>
      <span className="text-muted-foreground italic">—</span>
    </div>
  );
  let val = "—";
  if (unit === "km") val = `${((act.distance_meters || 0) / 1000).toFixed(1)} km`;
  else if (unit === "m") val = `${Math.round(act.distance_meters || 0)} m`;
  else {
    const sec = act.moving_time_seconds || act.duration_seconds || 0;
    const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
    val = h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
  }
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-right shrink-0">
        <p className="font-medium">{val}</p>
        {act.start_date && <p className="text-[10px] text-muted-foreground">{new Date(act.start_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</p>}
      </div>
    </div>
  );
}

function InsightBlock({ icon: Icon, title, items, tone }: { icon: any; title: string; items: { title: string; detail: string }[]; tone: "primary" | "warning" | "success" }) {
  const toneCls = {
    primary: "border-primary/20 bg-primary/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    success: "border-emerald-500/30 bg-emerald-500/5",
  }[tone];
  const iconCls = { primary: "text-primary", warning: "text-amber-600", success: "text-emerald-600" }[tone];
  return (
    <Card className={`p-4 space-y-3 border ${toneCls}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconCls}`} />
        <h3 className="font-heading font-semibold text-sm">{title}</h3>
      </div>
      {items?.length ? (
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={i} className="text-sm">
              <p className="font-medium">{it.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{it.detail}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground italic">Aucun élément</p>
      )}
    </Card>
  );
}
