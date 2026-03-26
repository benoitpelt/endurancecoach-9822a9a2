import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FORMATS: Record<string, string[]> = {
  triathlon: ["Sprint", "Olympique (M)", "Half Ironman (70.3)", "Ironman", "Autre"],
  running: ["5 km", "10 km", "Semi-marathon", "Marathon", "Ultra", "Trail", "Autre"],
  cycling: ["Granfondo", "Course sur route", "Contre-la-montre", "Ultra-distance", "Autre"],
};

export default function GoalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    goal_type: "",
    format: "",
    is_competition: false,
    event_name: "",
    target_date: "",
    location: "",
    primary_objective: "",
    secondary_objective: "",
    target_time: "",
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("race_goals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingId(data.id);
          setForm({
            goal_type: data.goal_type || "",
            format: data.format || "",
            is_competition: data.is_competition || false,
            event_name: data.event_name || "",
            target_date: data.target_date || "",
            location: data.location || "",
            primary_objective: data.primary_objective || "",
            secondary_objective: data.secondary_objective || "",
            target_time: data.target_time || "",
          });
        }
        setLoading(false);
      });
  }, [user]);

  const update = (key: string, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!user || !form.goal_type) {
      toast({ title: "Champ requis", description: "Choisissez un type d'objectif.", variant: "destructive" });
      return;
    }
    if (form.target_date && new Date(form.target_date) < new Date()) {
      toast({ title: "Date invalide", description: "La date cible doit être dans le futur.", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload = {
      user_id: user.id,
      goal_type: form.goal_type as "triathlon" | "running" | "cycling",
      format: form.format || null,
      is_competition: form.is_competition,
      event_name: form.event_name || null,
      target_date: form.target_date || null,
      location: form.location || null,
      primary_objective: form.primary_objective || null,
      secondary_objective: form.secondary_objective || null,
      target_time: form.target_time || null,
    };

    let error;
    if (existingId) {
      ({ error } = await supabase.from("race_goals").update(payload).eq("id", existingId));
    } else {
      ({ error } = await supabase.from("race_goals").insert(payload));
    }

    setSaving(false);
    if (error) {
      toast({ title: "Erreur", description: "Impossible de sauvegarder l'objectif.", variant: "destructive" });
    } else {
      toast({ title: "Objectif sauvegardé" });
      navigate("/onboarding/availability");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Votre objectif</h1>
          <p className="text-muted-foreground mt-1">Quel est votre prochain défi ?</p>
        </div>

        <div className="bg-card rounded-xl shadow-card p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type d'objectif *</Label>
              <Select value={form.goal_type} onValueChange={v => { update("goal_type", v); update("format", ""); }}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="triathlon">Triathlon</SelectItem>
                  <SelectItem value="running">Course à pied</SelectItem>
                  <SelectItem value="cycling">Vélo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.goal_type && (
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={form.format} onValueChange={v => update("format", v)}>
                  <SelectTrigger><SelectValue placeholder="Choisir un format" /></SelectTrigger>
                  <SelectContent>
                    {FORMATS[form.goal_type]?.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={form.is_competition} onCheckedChange={v => update("is_competition", v)} />
              <Label>C'est une compétition</Label>
            </div>

            <div className="space-y-2">
              <Label>{form.is_competition ? "Nom de l'événement" : "Titre de l'objectif"}</Label>
              <Input value={form.event_name} onChange={e => update("event_name", e.target.value)} placeholder={form.is_competition ? "Ironman Nice" : "Mon objectif marathon"} />
            </div>
            <div className="space-y-2">
              <Label>Date cible</Label>
              <Input type="date" value={form.target_date} onChange={e => update("target_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Lieu</Label>
              <Input value={form.location} onChange={e => update("location", e.target.value)} placeholder="Nice, France" />
            </div>
            <div className="space-y-2">
              <Label>Temps cible</Label>
              <Input value={form.target_time} onChange={e => update("target_time", e.target.value)} placeholder="3h30, sub 4h..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Objectif principal</Label>
            <Textarea value={form.primary_objective} onChange={e => update("primary_objective", e.target.value)} placeholder="Finir mon premier Ironman, battre mon record..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Objectif secondaire (optionnel)</Label>
            <Textarea value={form.secondary_objective} onChange={e => update("secondary_objective", e.target.value)} placeholder="Progresser en natation, m'amuser..." rows={2} />
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => navigate("/onboarding/profile")}>Retour</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-gradient-hero text-primary-foreground hover:opacity-90 px-8">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
