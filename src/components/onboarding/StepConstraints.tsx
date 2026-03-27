import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ConstraintsData {
  injuries_constraints: string;
  preferred_sessions: string;
  disliked_sessions: string;
  max_sessions_per_week: number | null;
  double_sessions: boolean;
  strength_training: boolean;
  time_preference: string;
  plan_failure_reason: string;
}

interface Props {
  data: ConstraintsData;
  onChange: (data: ConstraintsData) => void;
}

export default function StepConstraints({ data, onChange }: Props) {
  const update = (patch: Partial<ConstraintsData>) => onChange({ ...data, ...patch });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-heading font-bold">Tes contraintes et préférences</h2>
        <p className="text-muted-foreground text-sm">
          Ces informations nous aident à construire un plan réaliste que tu pourras vraiment suivre.
        </p>
      </div>

      {/* Injuries & constraints */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-3">
        <h3 className="font-heading font-semibold">Limites, fragilités, contraintes</h3>
        <p className="text-xs text-muted-foreground">
          Blessures actuelles ou passées, fragilités, contraintes familiales ou pro, mouvements à éviter…
        </p>
        <Textarea
          rows={4}
          placeholder="ex: tendinite au genou droit en 2023, pas disponible le mercredi soir…"
          value={data.injuries_constraints}
          onChange={(e) => update({ injuries_constraints: e.target.value })}
        />
      </div>

      {/* Preferences */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
        <h3 className="font-heading font-semibold">Préférences d'entraînement</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Séances préférées</Label>
            <Input
              placeholder="ex: sorties longues vélo, fractionné…"
              value={data.preferred_sessions}
              onChange={(e) => update({ preferred_sessions: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Séances moins aimées</Label>
            <Input
              placeholder="ex: natation technique, côtes…"
              value={data.disliked_sessions}
              onChange={(e) => update({ disliked_sessions: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Max séances par semaine</Label>
            <Input
              type="number"
              min={1}
              max={20}
              placeholder="ex: 7"
              value={data.max_sessions_per_week ?? ""}
              onChange={(e) => update({ max_sessions_per_week: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Préférence horaire</Label>
            <Select value={data.time_preference} onValueChange={(v) => update({ time_preference: v })}>
              <SelectTrigger><SelectValue placeholder="Pas de préférence" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="morning">Matin</SelectItem>
                <SelectItem value="midday">Midi</SelectItem>
                <SelectItem value="evening">Soir</SelectItem>
                <SelectItem value="no_preference">Pas de préférence</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between py-2">
          <Label className="text-sm">Doubles séances possibles ?</Label>
          <Switch checked={data.double_sessions} onCheckedChange={(v) => update({ double_sessions: v })} />
        </div>
        <div className="flex items-center justify-between py-2">
          <Label className="text-sm">Renforcement musculaire ?</Label>
          <Switch checked={data.strength_training} onCheckedChange={(v) => update({ strength_training: v })} />
        </div>
      </div>

      {/* Key question */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-3 border-2 border-primary/20">
        <h3 className="font-heading font-semibold text-primary">Question importante</h3>
        <Label className="text-sm font-medium">
          Qu'est-ce qui te fait le plus souvent rater ton plan ?
        </Label>
        <Textarea
          rows={3}
          placeholder="ex: manque de temps, fatigue accumulée, météo, motivation…"
          value={data.plan_failure_reason}
          onChange={(e) => update({ plan_failure_reason: e.target.value })}
        />
      </div>
    </div>
  );
}
