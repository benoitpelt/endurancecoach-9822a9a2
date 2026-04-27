import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface VolumesData {
  weekly_volume_hours: Record<string, number | null>;
  sessions_per_week: number | null;
  longest_recent_swim: string;
  longest_recent_bike: string;
  longest_recent_run: string;
  typical_sessions: string;
}

interface Props {
  data: VolumesData;
  onChange: (data: VolumesData) => void;
}

export default function StepVolumes({ data, onChange }: Props) {
  const update = (patch: Partial<VolumesData>) => onChange({ ...data, ...patch });

  const updateVolume = (sport: string, value: string) => {
    const vol = { ...data.weekly_volume_hours };
    vol[sport] = value ? Number(value) : null;
    update({ weekly_volume_hours: vol });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-heading font-bold">Tes volumes d'entraînement récents</h2>
        <p className="text-muted-foreground text-sm">Si tu ne connais pas exactement, une estimation suffit. Sinon, passe à la suite.</p>
      </div>

      <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-heading font-semibold">Volume moyen par semaine</h3>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total / semaine</div>
            <div className="text-lg font-heading font-bold text-primary">
              {(() => {
                const total = ["swim", "bike", "run"].reduce(
                  (s, k) => s + (Number(data.weekly_volume_hours[k]) || 0),
                  0
                );
                return total > 0 ? `${total.toFixed(1)} h` : "—";
              })()}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { key: "swim", label: "Natation (h)" },
            { key: "bike", label: "Vélo (h)" },
            { key: "run", label: "Course à pied (h)" },
          ].map((s) => (
            <div key={s.key} className="space-y-1.5">
              <Label className="text-sm">{s.label}</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                placeholder="ex: 2.5"
                value={data.weekly_volume_hours[s.key] ?? ""}
                onChange={(e) => updateVolume(s.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Indique tes heures moyennes par discipline — le total hebdo se calcule automatiquement.
        </p>

        <div className="space-y-1.5 pt-2 border-t border-border/60">
          <Label className="text-sm">Nombre total de séances par semaine</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            placeholder="ex: 6"
            value={data.sessions_per_week ?? ""}
            onChange={(e) => update({ sessions_per_week: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
        <h3 className="font-heading font-semibold">Plus longues séances récentes</h3>
        <p className="text-muted-foreground text-xs">Décris ta plus longue séance des 4-6 dernières semaines (durée, distance…).</p>
        <div className="grid grid-cols-1 gap-4">
          {[
            { key: "longest_recent_swim" as const, label: "Natation" },
            { key: "longest_recent_bike" as const, label: "Vélo" },
            { key: "longest_recent_run" as const, label: "Course à pied" },
          ].map((s) => (
            <div key={s.key} className="space-y-1.5">
              <Label className="text-sm">{s.label}</Label>
              <Input
                placeholder="ex: 1h30 — 3 km en bassin"
                value={data[s.key]}
                onChange={(e) => update({ [s.key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-card p-5 space-y-3">
        <h3 className="font-heading font-semibold">Séances types actuelles</h3>
        <p className="text-muted-foreground text-xs">Décris brièvement tes séances habituelles (ex: « 2 sorties vélo, 3 footings, 1 natation technique »).</p>
        <Textarea
          rows={3}
          placeholder="Décris tes séances habituelles…"
          value={data.typical_sessions}
          onChange={(e) => update({ typical_sessions: e.target.value })}
        />
      </div>
    </div>
  );
}
