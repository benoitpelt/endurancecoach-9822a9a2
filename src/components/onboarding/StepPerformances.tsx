import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface PerformancesData {
  triathlon: {
    formats_done?: string;
    longest_format?: string;
    reference_time?: string;
  };
  running: {
    best_5k?: string;
    best_10k?: string;
    best_half?: string;
    best_marathon?: string;
    recent_reference?: string;
  };
  cycling: {
    longest_ride?: string;
    events?: string;
    level_reference?: string;
  };
  swimming: {
    best_100m?: string;
    other_reference?: string;
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
        <h2 className="text-xl sm:text-2xl font-heading font-bold">Quelles sont tes meilleures perfs ?</h2>
        <p className="text-muted-foreground text-sm">
          Indique ce que tu connais — même un chrono approximatif nous aide. Sinon, laisse vide.
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
            <Field label="Formats déjà réalisés" placeholder="ex: 2 sprints, 1 olympique" value={data.triathlon.formats_done} onChange={(v) => updateSport("triathlon", { formats_done: v })} />
            <Field label="Format le plus long terminé" placeholder="ex: Olympique, Half Ironman…" value={data.triathlon.longest_format} onChange={(v) => updateSport("triathlon", { longest_format: v })} />
            <Field label="Temps de référence (si connu)" placeholder="ex: 2h45 sur olympique" value={data.triathlon.reference_time} onChange={(v) => updateSport("triathlon", { reference_time: v })} />
          </div>
        </TabsContent>

        <TabsContent value="running" className="mt-4">
          <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
            <Field label="Meilleur 5 km" placeholder="ex: 22:30" value={data.running.best_5k} onChange={(v) => updateSport("running", { best_5k: v })} />
            <Field label="Meilleur 10 km" placeholder="ex: 47:00" value={data.running.best_10k} onChange={(v) => updateSport("running", { best_10k: v })} />
            <Field label="Meilleur semi-marathon" placeholder="ex: 1h48" value={data.running.best_half} onChange={(v) => updateSport("running", { best_half: v })} />
            <Field label="Meilleur marathon" placeholder="ex: 3h55" value={data.running.best_marathon} onChange={(v) => updateSport("running", { best_marathon: v })} />
            <Field label="Chrono récent de référence" placeholder="ex: 10 km en 48:00 il y a 3 semaines" value={data.running.recent_reference} onChange={(v) => updateSport("running", { recent_reference: v })} />
          </div>
        </TabsContent>

        <TabsContent value="cycling" className="mt-4">
          <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
            <Field label="Plus longue sortie récente" placeholder="ex: 100 km, 3h30" value={data.cycling.longest_ride} onChange={(v) => updateSport("cycling", { longest_ride: v })} />
            <Field label="Événements réalisés" placeholder="ex: Étape du Tour, cyclosportive…" value={data.cycling.events} onChange={(v) => updateSport("cycling", { events: v })} />
            <Field label="Repère de niveau" placeholder="ex: FTP estimée 220W, ou 30 km/h de moyenne" value={data.cycling.level_reference} onChange={(v) => updateSport("cycling", { level_reference: v })} />
          </div>
        </TabsContent>

        <TabsContent value="swimming" className="mt-4">
          <div className="bg-card rounded-xl shadow-card p-5 space-y-4">
            <Field label="Meilleur repère sur 100 m" placeholder="ex: 1:45 / 100 m" value={data.swimming.best_100m} onChange={(v) => updateSport("swimming", { best_100m: v })} />
            <Field label="Autre repère connu" placeholder="ex: 400 m en 7:30, 1500 m en 30 min" value={data.swimming.other_reference} onChange={(v) => updateSport("swimming", { other_reference: v })} />
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
