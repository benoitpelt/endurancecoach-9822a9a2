import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface HistoryData {
  sport_experience: Record<string, { years?: number; prepared_goals?: string }>;
  current_frequency_per_week: number | null;
  strongest_discipline: string;
  weakest_discipline: string;
}

interface Props {
  data: HistoryData;
  onChange: (data: HistoryData) => void;
}

const DISCIPLINES = [
  { value: "swimming", label: "Natation" },
  { value: "cycling", label: "Vélo" },
  { value: "running", label: "Course à pied" },
];

export default function StepHistory({ data, onChange }: Props) {
  const update = (patch: Partial<HistoryData>) => onChange({ ...data, ...patch });

  const updateSportExp = (sport: string, field: string, value: string | number) => {
    const exp = { ...data.sport_experience };
    exp[sport] = { ...exp[sport], [field]: value };
    update({ sport_experience: exp });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-heading font-bold">Parlons de ton expérience sportive</h2>
        <p className="text-muted-foreground text-sm">Pas besoin d'être précis au jour près. Une idée globale suffit.</p>
      </div>

      {/* Sport experience per discipline */}
      <div className="space-y-6">
        {DISCIPLINES.map(({ value, label }) => (
          <div key={value} className="bg-card rounded-xl shadow-card p-5 space-y-4">
            <h3 className="font-heading font-semibold">{label}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Années de pratique</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  placeholder="ex: 3"
                  value={data.sport_experience[value]?.years ?? ""}
                  onChange={(e) => updateSportExp(value, "years", e.target.value ? Number(e.target.value) : "")}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Objectifs déjà préparés</Label>
                <Input
                  placeholder="ex: 2 sprints, 1 marathon"
                  value={data.sport_experience[value]?.prepared_goals ?? ""}
                  onChange={(e) => updateSportExp(value, "prepared_goals", e.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Frequency */}
      <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
        <h3 className="font-heading font-semibold">Ta pratique actuelle</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Fréquence actuelle (séances/semaine)</Label>
            <Input
              type="number"
              min={0}
              max={20}
              placeholder="ex: 5"
              value={data.current_frequency_per_week ?? ""}
              onChange={(e) => update({ current_frequency_per_week: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Discipline la plus forte</Label>
            <Select value={data.strongest_discipline} onValueChange={(v) => update({ strongest_discipline: v })}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                {DISCIPLINES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Discipline la plus faible / limitante</Label>
            <Select value={data.weakest_discipline} onValueChange={(v) => update({ weakest_discipline: v })}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                {DISCIPLINES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
