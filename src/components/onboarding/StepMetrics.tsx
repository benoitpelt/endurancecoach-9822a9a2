import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

export interface MetricsData {
  hr_max: string;
  hr_rest: string;
  ftp: string;
  threshold_pace_run: string;
  css: string;
  pace_100m_max: string;
  pace_100m_easy: string;
  weight: string;
  unknown: Record<string, boolean>;
}

interface Props {
  data: MetricsData;
  onChange: (data: MetricsData) => void;
}

const METRICS = [
  { key: "hr_max", label: "FC max", unit: "bpm", placeholder: "ex: 185", help: "Fréquence cardiaque maximale mesurée lors d'un effort intense." },
  { key: "hr_rest", label: "FC repos", unit: "bpm", placeholder: "ex: 52", help: "Fréquence cardiaque au réveil, au calme." },
  { key: "ftp", label: "FTP (vélo)", unit: "watts", placeholder: "ex: 220", help: "Puissance que tu peux tenir pendant ~1h sur le vélo." },
  { key: "threshold_pace_run", label: "Allure seuil course", unit: "min/km", placeholder: "ex: 4:45", help: "Allure que tu tiens sur ~30-40 min en course." },
  { key: "css", label: "CSS (natation)", unit: "min/100m", placeholder: "ex: 1:50", help: "Allure de seuil en natation (Critical Swim Speed)." },
  { key: "pace_100m_max", label: "Allure 100 m max", unit: "min/100m", placeholder: "ex: 1:25", help: "Ton meilleur rythme sur 100 m en natation." },
  { key: "pace_100m_easy", label: "Allure 100 m endurance", unit: "min/100m", placeholder: "ex: 2:10", help: "Ton allure confortable sur de longues distances." },
  { key: "weight", label: "Poids actuel", unit: "kg", placeholder: "ex: 72", help: "Ton poids actuel." },
] as const;

export default function StepMetrics({ data, onChange }: Props) {
  const toggleUnknown = (key: string) => {
    const unknown = { ...data.unknown, [key]: !data.unknown[key] };
    const patch: any = { unknown };
    if (!data.unknown[key]) {
      patch[key] = "";
    }
    onChange({ ...data, ...patch });
  };

  const updateField = (key: string, value: string) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-heading font-bold">Tes repères physiologiques</h2>
        <p className="text-muted-foreground text-sm">
          Si tu connais certaines valeurs, indique-les. Sinon, clique sur «&nbsp;Je ne sais pas&nbsp;» — on estimera plus tard.
        </p>
      </div>

      <div className="space-y-4">
        {METRICS.map((m) => {
          const isUnknown = data.unknown[m.key];
          return (
            <div key={m.key} className="bg-card rounded-xl shadow-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{m.label}</Label>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <HelpCircle className="h-3 w-3 shrink-0" /> {m.help}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={isUnknown ? "default" : "outline"}
                  size="sm"
                  className="shrink-0 text-xs"
                  onClick={() => toggleUnknown(m.key)}
                >
                  Je ne sais pas
                </Button>
              </div>
              {!isUnknown && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={m.placeholder}
                    value={(data as any)[m.key]}
                    onChange={(e) => updateField(m.key, e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{m.unit}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
