import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Check, X, RefreshCw, ArrowRight, Shield, AlertTriangle, Info } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const SPORT_EMOJI: Record<string, string> = { swim: "🏊", bike: "🚴", run: "🏃", strength: "💪", mobility: "🧘", rest: "😴" };
const SPORT_LABELS: Record<string, string> = { swim: "Natation", bike: "Vélo", run: "Course", strength: "Renfo", mobility: "Mobilité", rest: "Repos" };
const PRIORITY_STYLES: Record<string, { label: string; classes: string }> = {
  key: { label: "Clé", classes: "bg-primary/15 text-primary" },
  important: { label: "Important", classes: "bg-warning/15 text-warning" },
  optional: { label: "Optionnel", classes: "bg-muted text-muted-foreground" },
};
const CHANGE_LABELS: Record<string, { label: string; classes: string }> = {
  kept: { label: "Inchangée", classes: "text-muted-foreground" },
  moved: { label: "Déplacée", classes: "text-primary" },
  lightened: { label: "Allégée", classes: "text-warning" },
  cancelled: { label: "Annulée", classes: "text-destructive" },
  reprioritized: { label: "Repriorisée", classes: "text-accent" },
  replaced: { label: "Remplacée", classes: "text-primary" },
};

export default function WeekProposalPage() {
  const { weekId, proposalId } = useParams<{ weekId: string; proposalId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [proposal, setProposal] = useState<any>(null);
  const [week, setWeek] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !proposalId) return;
    loadProposal();
  }, [user, proposalId]);

  const loadProposal = async () => {
    try {
      setLoading(true);
      const [propRes, weekRes] = await Promise.all([
        supabase.from("weekly_adjustment_proposals").select("*").eq("id", proposalId!).eq("user_id", user!.id).maybeSingle(),
        supabase.from("training_weeks").select("*").eq("id", weekId!).eq("user_id", user!.id).maybeSingle(),
      ]);
      if (!propRes.data) { setError("Proposition introuvable."); return; }
      setProposal(propRes.data);
      setWeek(weekRes.data);
    } catch {
      setError("Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    try {
      setApplying(true);
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Session expirée.");

      const res = await supabase.functions.invoke("adjust-week", {
        headers: { Authorization: `Bearer ${token}` },
        body: { week_id: weekId, proposal_id: proposalId, action: "apply" },
      });

      if (res.error) throw new Error(typeof res.error === "object" && "message" in res.error ? (res.error as any).message : String(res.error));
      if (res.data?.error) throw new Error(res.data.error);

      toast.success("Semaine mise à jour !");
      navigate(`/plan/week/${weekId}`);
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
      setError(e?.message || "Erreur");
    } finally {
      setApplying(false);
    }
  };

  const handleReject = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Session expirée.");

      await supabase.functions.invoke("adjust-week", {
        headers: { Authorization: `Bearer ${token}` },
        body: { week_id: weekId, proposal_id: proposalId, action: "reject" },
      });

      toast.info("Proposition refusée.");
      navigate(`/plan/week/${weekId}`);
    } catch (e: any) {
      toast.error(e?.message || "Erreur");
    }
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "EEE d MMM", { locale: fr }); } catch { return d; }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (error && !proposal) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2"><ArrowLeft className="h-4 w-4" /> Retour</Button>
          <p className="text-destructive text-center">{error}</p>
        </div>
      </div>
    );
  }

  if (!proposal) return null;

  const originalWorkouts = (proposal.original_workouts || []) as any[];
  const proposedWorkouts = (proposal.proposed_workouts || []) as any[];
  const protectedWorkouts = (proposal.protected_workouts || []) as any[];
  const sacrificedWorkouts = (proposal.sacrificed_workouts || []) as any[];
  const isAlreadyProcessed = proposal.status !== "pending";

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate(`/plan/week/${weekId}`)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Retour à la semaine
        </Button>

        {/* Header */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-heading font-bold">Proposition de réorganisation</h1>
              <p className="text-sm text-muted-foreground">Semaine {week?.week_number}</p>
            </div>
            {isAlreadyProcessed && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${proposal.status === "accepted" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                {proposal.status === "accepted" ? "Appliquée" : "Refusée"}
              </span>
            )}
          </div>
        </div>

        {/* Summary */}
        {proposal.changes_summary && (
          <div className="bg-gradient-subtle rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              <span className="font-heading font-semibold text-sm">Résumé des changements</span>
            </div>
            <p className="text-sm text-muted-foreground">{proposal.changes_summary}</p>
          </div>
        )}

        {/* Before / After comparison */}
        <div className="space-y-3">
          <h2 className="font-heading font-semibold text-lg">Comparaison avant / après</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Before */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Avant</h3>
              {originalWorkouts.map((wo: any, i: number) => {
                const pr = PRIORITY_STYLES[wo.workout_priority] || PRIORITY_STYLES.important;
                return (
                  <div key={i} className="bg-card rounded-lg p-3 border border-border space-y-1">
                    <div className="flex items-center gap-2">
                      <span>{SPORT_EMOJI[wo.sport_type] || "🏋️"}</span>
                      <span className="text-sm font-medium">{SPORT_LABELS[wo.sport_type] || wo.sport_type}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${pr.classes}`}>{pr.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(wo.scheduled_date)}
                      {wo.duration_target_minutes && ` · ${wo.duration_target_minutes}min`}
                    </p>
                    {wo.session_goal && <p className="text-xs text-muted-foreground truncate">{wo.session_goal}</p>}
                  </div>
                );
              })}
            </div>

            {/* After */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Après</h3>
              {proposedWorkouts.map((wo: any, i: number) => {
                const pr = PRIORITY_STYLES[wo.workout_priority] || PRIORITY_STYLES.important;
                const change = CHANGE_LABELS[wo.change_type] || { label: wo.change_type, classes: "" };
                const isCancelled = wo.status === "cancelled" || wo.change_type === "cancelled";
                return (
                  <div key={i} className={`bg-card rounded-lg p-3 border space-y-1 ${isCancelled ? "border-destructive/30 opacity-60" : wo.change_type === "kept" ? "border-border" : "border-primary/30"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{SPORT_EMOJI[wo.sport_type] || "🏋️"}</span>
                      <span className={`text-sm font-medium ${isCancelled ? "line-through" : ""}`}>
                        {SPORT_LABELS[wo.sport_type] || wo.sport_type}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${pr.classes}`}>{pr.label}</span>
                      {wo.change_type !== "kept" && (
                        <span className={`text-[10px] font-semibold ${change.classes}`}>{change.label}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(wo.scheduled_date)}
                      {wo.duration_target_minutes && ` · ${wo.duration_target_minutes}min`}
                    </p>
                    {wo.session_goal && <p className="text-xs text-muted-foreground truncate">{wo.session_goal}</p>}
                    {wo.change_reason && wo.change_type !== "kept" && (
                      <p className="text-xs text-primary/80 italic">{wo.change_reason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Protected */}
        {protectedWorkouts.length > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-heading font-semibold text-sm">Séances protégées</span>
            </div>
            <ul className="space-y-1">
              {protectedWorkouts.map((pw: any, i: number) => (
                <li key={i} className="text-sm text-muted-foreground">• {pw.reason || pw.id}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Sacrificed */}
        {sacrificedWorkouts.length > 0 && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="font-heading font-semibold text-sm">Séances sacrifiées</span>
            </div>
            <ul className="space-y-1">
              {sacrificedWorkouts.map((sw: any, i: number) => (
                <li key={i} className="text-sm text-muted-foreground">• {sw.reason || sw.id}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Detailed explanation */}
        {proposal.detailed_explanation && (
          <div className="bg-card rounded-xl shadow-card p-6 space-y-2">
            <h2 className="font-heading font-semibold">Explication détaillée</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{proposal.detailed_explanation}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-lg p-4">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Actions */}
        {!isAlreadyProcessed && (
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={handleApply} disabled={applying} className="gap-2 flex-1">
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {applying ? "Application…" : "Appliquer la proposition"}
            </Button>
            <Button variant="outline" onClick={() => navigate(`/plan/week/${weekId}/adjust`)} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Recalculer
            </Button>
            <Button variant="ghost" onClick={handleReject} className="gap-2">
              <X className="h-4 w-4" /> Refuser
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
