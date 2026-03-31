import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const DAY_NAMES = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const SPORT_OPTIONS = [
  { value: "", label: "Pas de préférence" },
  { value: "swim", label: "🏊 Natation" },
  { value: "bike", label: "🚴 Vélo" },
  { value: "run", label: "🏃 Course à pied" },
  { value: "strength", label: "💪 Renforcement" },
  { value: "mobility", label: "🧘 Mobilité" },
  { value: "rest", label: "😴 Repos" },
];

const WEEKEND_OPTIONS = [
  { value: "", label: "Pas de contrainte" },
  { value: "free", label: "Week-end libre" },
  { value: "limited", label: "Week-end limité" },
  { value: "unavailable", label: "Week-end indisponible" },
];

type Workout = {
  id: string;
  sport_type: string;
  workout_priority: string;
  session_goal: string | null;
  scheduled_date: string | null;
};

export default function WeekConstraintsPage() {
  const { weekId } = useParams<{ weekId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [week, setWeek] = useState<any>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Constraint state
  const [fatigue, setFatigue] = useState(3);
  const [lifeLoad, setLifeLoad] = useState(3);
  const [unavailableDays, setUnavailableDays] = useState<number[]>([]);
  const [maxDurations, setMaxDurations] = useState<Record<number, number>>({});
  const [weekendConstraint, setWeekendConstraint] = useState("");
  const [freeText, setFreeText] = useState("");
  const [sportPrefs, setSportPrefs] = useState<Record<number, string>>({});
  const [protectWorkoutIds, setProtectWorkoutIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user || !weekId) return;
    loadData();
  }, [user, weekId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [weekRes, workoutsRes] = await Promise.all([
        supabase.from("training_weeks").select("*").eq("id", weekId!).eq("user_id", user!.id).maybeSingle(),
        supabase.from("planned_workouts")
          .select("id, sport_type, workout_priority, session_goal, scheduled_date")
          .eq("week_id", weekId!).eq("user_id", user!.id).order("scheduled_date"),
      ]);
      if (!weekRes.data) { setError("Semaine introuvable."); return; }
      setWeek(weekRes.data);
      setWorkouts((workoutsRes.data || []) as Workout[]);
    } catch {
      setError("Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day: number) => {
    setUnavailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const setMaxDuration = (day: number, value: string) => {
    const num = parseInt(value);
    if (isNaN(num) || num <= 0) {
      setMaxDurations((prev) => { const n = { ...prev }; delete n[day]; return n; });
    } else {
      setMaxDurations((prev) => ({ ...prev, [day]: num }));
    }
  };

  const toggleProtect = (id: string) => {
    setProtectWorkoutIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (!user || !weekId) return;
    try {
      setGenerating(true);
      setError(null);

      // Save constraints
      const constraintPayload = {
        user_id: user.id,
        week_id: weekId,
        perceived_fatigue: fatigue,
        life_load: lifeLoad,
        unavailable_days: unavailableDays,
        max_duration_per_day: maxDurations,
        weekend_constraint: weekendConstraint || null,
        free_text: freeText || null,
        sport_preferences_per_day: sportPrefs,
        explicit_requests: protectWorkoutIds.map((id) => ({ type: "protect", workout_id: id })),
        status: "submitted",
      };

      const { data: constraint, error: cErr } = await supabase
        .from("weekly_constraints")
        .insert(constraintPayload)
        .select()
        .single();

      if (cErr) throw cErr;

      // Call edge function
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) throw new Error("Session expirée.");

      const res = await supabase.functions.invoke("adjust-week", {
        headers: { Authorization: `Bearer ${token}` },
        body: { week_id: weekId, constraint_id: constraint.id },
      });

      if (res.error) {
        const msg = typeof res.error === "object" && "message" in res.error
          ? (res.error as any).message : String(res.error);
        throw new Error(msg);
      }

      const data = res.data;
      if (data?.error) throw new Error(data.error);

      toast.success("Proposition générée !");
      navigate(`/plan/week/${weekId}/proposal/${data.proposal.id}`);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Erreur lors de la génération.");
      toast.error(e?.message || "Erreur");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (error && !week) {
    return (
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2"><ArrowLeft className="h-4 w-4" /> Retour</Button>
          <p className="text-destructive text-center">{error}</p>
        </div>
      </div>
    );
  }

  const SPORT_EMOJI: Record<string, string> = { swim: "🏊", bike: "🚴", run: "🏃", strength: "💪", mobility: "🧘", rest: "😴" };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate(`/plan/week/${weekId}`)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Retour à la semaine
        </Button>

        <div className="bg-card rounded-xl shadow-card p-6 space-y-2">
          <h1 className="text-2xl font-heading font-bold">Modifier ma semaine {week?.week_number}</h1>
          <p className="text-sm text-muted-foreground">
            Indique tes contraintes et préférences pour cette semaine. Le coach te proposera une réorganisation adaptée.
          </p>
        </div>

        {/* Fatigue & Life Load */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-5">
          <h2 className="font-heading font-semibold">État général</h2>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Fatigue perçue</span>
                <span className="font-semibold text-primary">{fatigue}/5</span>
              </div>
              <Slider value={[fatigue]} onValueChange={(v) => setFatigue(v[0])} min={1} max={5} step={1} />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Frais</span><span>Épuisé</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Charge de vie</span>
                <span className="font-semibold text-primary">{lifeLoad}/5</span>
              </div>
              <Slider value={[lifeLoad]} onValueChange={(v) => setLifeLoad(v[0])} min={1} max={5} step={1} />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Tranquille</span><span>Surchargé</span>
              </div>
            </div>
          </div>
        </div>

        {/* Unavailable days */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
          <h2 className="font-heading font-semibold">Jours indisponibles</h2>
          <div className="grid grid-cols-7 gap-2">
            {DAY_NAMES.map((name, idx) => (
              <button
                key={idx}
                onClick={() => toggleDay(idx)}
                className={`py-2 px-1 rounded-lg text-xs font-medium transition-colors ${
                  unavailableDays.includes(idx)
                    ? "bg-destructive/15 text-destructive border border-destructive/30"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {name.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        {/* Max duration per day */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
          <h2 className="font-heading font-semibold">Durée max par jour (optionnel)</h2>
          <p className="text-xs text-muted-foreground">Laisse vide si pas de limite spécifique.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {DAY_NAMES.map((name, idx) => (
              <div key={idx} className="space-y-1">
                <label className="text-xs font-medium">{name.slice(0, 3)}</label>
                <input
                  type="number"
                  placeholder="min"
                  min={0}
                  max={300}
                  value={maxDurations[idx] ?? ""}
                  onChange={(e) => setMaxDuration(idx, e.target.value)}
                  disabled={unavailableDays.includes(idx)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Weekend constraint */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
          <h2 className="font-heading font-semibold">Contrainte week-end</h2>
          <Select value={weekendConstraint} onValueChange={setWeekendConstraint}>
            <SelectTrigger><SelectValue placeholder="Pas de contrainte" /></SelectTrigger>
            <SelectContent>
              {WEEKEND_OPTIONS.map((o) => <SelectItem key={o.value || "none"} value={o.value || "none"}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Sport preferences per day */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
          <h2 className="font-heading font-semibold">Préférence sport par jour (optionnel)</h2>
          <div className="space-y-2">
            {DAY_NAMES.map((name, idx) => {
              if (unavailableDays.includes(idx)) return null;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-sm w-20">{name}</span>
                  <Select value={sportPrefs[idx] || ""} onValueChange={(v) => setSportPrefs((p) => ({ ...p, [idx]: v }))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Pas de préférence" /></SelectTrigger>
                    <SelectContent>
                      {SPORT_OPTIONS.map((o) => <SelectItem key={o.value || "none"} value={o.value || "none"}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Protect workouts */}
        {workouts.length > 0 && (
          <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
            <h2 className="font-heading font-semibold">Séances à protéger</h2>
            <p className="text-xs text-muted-foreground">Le coach essaiera de préserver ces séances en priorité.</p>
            <div className="space-y-2">
              {workouts.filter((w) => w.workout_priority === "key" || w.workout_priority === "important").map((wo) => (
                <label key={wo.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 cursor-pointer">
                  <Switch
                    checked={protectWorkoutIds.includes(wo.id)}
                    onCheckedChange={() => toggleProtect(wo.id)}
                  />
                  <div className="flex items-center gap-2">
                    <span>{SPORT_EMOJI[wo.sport_type] || "🏋️"}</span>
                    <span className="text-sm font-medium">{wo.session_goal || wo.sport_type}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${wo.workout_priority === "key" ? "bg-primary/15 text-primary" : "bg-warning/15 text-warning"}`}>
                      {wo.workout_priority === "key" ? "Clé" : "Important"}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Free text */}
        <div className="bg-card rounded-xl shadow-card p-6 space-y-4">
          <h2 className="font-heading font-semibold">Demande libre</h2>
          <p className="text-xs text-muted-foreground">
            Ex: "cale ma sortie longue vélo lundi", "je veux préserver ma séance course clé", "week-end très chargé"
          </p>
          <Textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Tes contraintes ou préférences..."
            rows={3}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-lg p-4">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Generate */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleGenerate} disabled={generating} className="gap-2 flex-1">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Génération en cours…" : "Proposer une réorganisation"}
          </Button>
          <Button variant="outline" onClick={() => navigate(`/plan/week/${weekId}`)}>
            Annuler
          </Button>
        </div>

        {generating && (
          <p className="text-xs text-muted-foreground text-center animate-pulse">
            Le coach analyse tes contraintes et réorganise ta semaine…
          </p>
        )}
      </div>
    </div>
  );
}
