import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Clock, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const CHANGE_LABELS: Record<string, string> = {
  moved: "Déplacée",
  lightened: "Allégée",
  cancelled: "Annulée",
  reprioritized: "Repriorisée",
  replaced: "Remplacée",
  kept: "Inchangée",
};

export default function AdjustmentHistoryPage() {
  const { weekId } = useParams<{ weekId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [impacted, setImpacted] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (!user || !weekId) return;
    loadHistory();
  }, [user, weekId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const { data: adjData } = await supabase
        .from("plan_adjustments")
        .select("*")
        .eq("week_id", weekId!)
        .eq("user_id", user!.id)
        .order("applied_at", { ascending: false });

      const adjs = adjData || [];
      setAdjustments(adjs);

      if (adjs.length > 0) {
        const adjIds = adjs.map((a: any) => a.id);
        const { data: impData } = await supabase
          .from("adjustment_impacted_workouts")
          .select("*")
          .in("adjustment_id", adjIds)
          .eq("user_id", user!.id);

        const grouped: Record<string, any[]> = {};
        for (const imp of (impData || [])) {
          if (!grouped[imp.adjustment_id]) grouped[imp.adjustment_id] = [];
          grouped[imp.adjustment_id].push(imp);
        }
        setImpacted(grouped);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d), "d MMM yyyy à HH:mm", { locale: fr }); } catch { return d; }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate(`/plan/week/${weekId}`)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Retour à la semaine
        </Button>

        <div className="bg-card rounded-xl shadow-card p-6 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-heading font-bold">Historique des ajustements</h1>
          </div>
          <p className="text-sm text-muted-foreground">Toutes les modifications appliquées à cette semaine.</p>
        </div>

        {adjustments.length === 0 ? (
          <div className="bg-card rounded-xl shadow-card p-6 text-center">
            <p className="text-muted-foreground">Aucun ajustement enregistré pour cette semaine.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {adjustments.map((adj) => {
              const impactedList = impacted[adj.id] || [];
              return (
                <div key={adj.id} className="bg-card rounded-xl shadow-card p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{adj.reason_summary || "Réorganisation de semaine"}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(adj.applied_at)}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {adj.adjustment_type === "weekly_reorganization" ? "Réorganisation" : adj.adjustment_type}
                    </span>
                  </div>

                  {adj.detailed_summary && (
                    <p className="text-sm text-muted-foreground">{adj.detailed_summary}</p>
                  )}

                  {impactedList.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Séances impactées</p>
                      {impactedList.map((imp: any) => (
                        <div key={imp.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/50">
                          <span className={`font-medium ${imp.change_type === "cancelled" ? "text-destructive" : "text-primary"}`}>
                            {CHANGE_LABELS[imp.change_type] || imp.change_type}
                          </span>
                          {imp.old_values?.scheduled_date && imp.new_values?.scheduled_date && imp.old_values.scheduled_date !== imp.new_values.scheduled_date && (
                            <span className="text-muted-foreground">
                              {imp.old_values.scheduled_date} → {imp.new_values.scheduled_date}
                            </span>
                          )}
                          {imp.old_values?.duration_target_minutes && imp.new_values?.duration_target_minutes && imp.old_values.duration_target_minutes !== imp.new_values.duration_target_minutes && (
                            <span className="text-muted-foreground">
                              {imp.old_values.duration_target_minutes}min → {imp.new_values.duration_target_minutes}min
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
