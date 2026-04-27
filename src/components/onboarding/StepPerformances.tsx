import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface PerformancesData {
  triathlon: {
    longest_format?: string;
  };
  running: {
    longest_run?: string;
  };
  cycling: {
    longest_ride?: string;
  };
  swimming: {
    longest_swim?: string;
  };
}

interface Props {
  data: PerformancesData;
  onChange: (data: PerformancesData) => void;
}

export default function StepPerformances({ data, onChange }: Props) {
  const [tab, setTab] = useState("triathlon");

  const updateSport = <T extends keyof PerformancesData>(sport: T, patch: Partial<PerformancesData[T]>) => {
    onChange({ ...data, [sport]: { ...data[sport], ...patch } });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-heading font-bold">Tes sorties les plus longues</h2>
        <p className="text-muted-foreground text-sm">
          Indique simplement la sortie la plus longue que tu as déjà réalisée dans chaque discipline. Laisse vide si tu ne pratiques pas.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="triathlon">Triathlon</TabsTrigger>
          <TabsTrigger value="running">Course</TabsTrigger>
          <TabsTrigger value="cycling">Vélo</TabsTrigger>
          <TabsTrigger value="swimming">Natation</TabsTrigger>
        </TabsList>

        <TabsContent value="triathlon" className="mt-4">
          <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
            <Field
              label="Format le plus long terminé"
              placeholder="ex: Olympique, Half Ironman…"
              value={data.triathlon.longest_format}
              onChange={(v) => updateSport("triathlon", { longest_format: v })}
            />
          </div>
        </TabsContent>

        <TabsContent value="running" className="mt-4">
          <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
            <Field
              label="Plus longue course réalisée"
              placeholder="ex: 21 km, 2h00"
              value={data.running.longest_run}
              onChange={(v) => updateSport("running", { longest_run: v })}
            />
          </div>
        </TabsContent>

        <TabsContent value="cycling" className="mt-4">
          <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
            <Field
              label="Plus longue sortie vélo"
              placeholder="ex: 100 km, 3h30"
              value={data.cycling.longest_ride}
              onChange={(v) => updateSport("cycling", { longest_ride: v })}
            />
          </div>
        </TabsContent>

        <TabsContent value="swimming" className="mt-4">
          <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
            <Field
              label="Plus longue séance de natation"
              placeholder="ex: 2 km en bassin, 1 km en eau libre"
              value={data.swimming.longest_swim}
              onChange={(v) => updateSport("swimming", { longest_swim: v })}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, placeholder, value, onChange }: { label: string; placeholder: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input placeholder={placeholder} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
