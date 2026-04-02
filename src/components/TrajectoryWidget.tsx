import { useNavigate } from "react-router-dom";
import { Target, TrendingUp, AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
  on_track: { label: "En bonne voie", color: "text-accent", icon: TrendingUp },
  watch: { label: "À surveiller", color: "text-warning", icon: AlertTriangle },
  ambitious: { label: "Ambitieux", color: "text-warning", icon: AlertTriangle },
  fragile: { label: "Fragile", color: "text-destructive", icon: AlertTriangle },
};

type TrajectoryWidgetProps = {
  trajectory: {
    trajectory_status: string;
    realism_score_percent: number;
    summary_short: string;
    supporting_points?: string[];
    weakening_points?: string[];
    suggests_plan_review?: boolean;
  } | null;
  daysRemaining: number | null;
  loading?: boolean;
};

export default function TrajectoryWidget({ trajectory, daysRemaining, loading }: TrajectoryWidgetProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="bg-card rounded-xl shadow-card p-5 animate-pulse space-y-3">
        <div className="h-4 bg-muted rounded w-1/3" />
        <div className="h-8 bg-muted rounded w-1/2" />
        <div className="h-3 bg-muted rounded w-2/3" />
      </div>
    );
  }

  if (!trajectory) {
    return (
      <button
        onClick={() => navigate("/trajectory")}
        className="w-full bg-card rounded-xl shadow-card p-5 text-left hover:shadow-elevated transition-shadow"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <span className="font-heading font-semibold">Trajectoire objectif</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          Calcule ta trajectoire pour savoir où tu en es par rapport à ton objectif.
        </p>
      </button>
    );
  }

  // Handle insufficient_data or unknown status gracefully
  if (trajectory.trajectory_status === "insufficient_data" || trajectory.realism_score_percent == null) {
    return (
      <button
        onClick={() => navigate("/trajectory")}
        className="w-full bg-card rounded-xl shadow-card p-5 text-left hover:shadow-elevated transition-shadow"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <span className="font-heading font-semibold">Trajectoire objectif</span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {trajectory.summary_short || "Pas encore assez de données pour évaluer ta trajectoire."}
        </p>
      </button>
    );
  }

  const config = STATUS_CONFIG[trajectory.trajectory_status] || STATUS_CONFIG.watch;
  const StatusIcon = config.icon;

  const topPoint = trajectory.weakening_points?.[0] || trajectory.supporting_points?.[0];

  return (
    <button
      onClick={() => navigate("/trajectory")}
      className="w-full bg-card rounded-xl shadow-card p-5 text-left hover:shadow-elevated transition-shadow"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <span className="font-heading font-semibold">Trajectoire objectif</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex items-center gap-4 mb-3">
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
            <circle
              cx="28" cy="28" r="24" fill="none"
              stroke="currentColor"
              strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${(trajectory.realism_score_percent / 100) * 150.8} 150.8`}
              className={config.color}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-heading font-bold">
            {trajectory.realism_score_percent}%
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <StatusIcon className={`h-3.5 w-3.5 ${config.color}`} />
            <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{trajectory.summary_short}</p>
        </div>
      </div>

      {daysRemaining !== null && (
        <p className="text-xs text-muted-foreground">
          {daysRemaining > 0 ? `${daysRemaining} jours restants` : "Objectif imminent"}
        </p>
      )}

      {topPoint && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
          💡 {topPoint}
        </p>
      )}

      {trajectory.suggests_plan_review && (
        <div className="mt-2 text-xs text-warning flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Une revue du plan pourrait être utile
        </div>
      )}
    </button>
  );
}
