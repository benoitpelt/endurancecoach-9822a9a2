import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

interface DayRule {
  is_available: boolean;
  max_duration_minutes: string;
  note: string;
}

export default function AvailabilityPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [days, setDays] = useState<DayRule[]>(
    DAYS.map(() => ({ is_available: false, max_duration_minutes: "", note: "" }))
  );

  useEffect(() => {
    if (!user) return;
    supabase
      .from("default_availability_rules")
      .select("*")
      .eq("user_id", user.id)
      .order("day_of_week")
      .then(({ data }) => {
        if (data && data.length > 0) {
          const updated = [...days];
          data.forEach(rule => {
            updated[rule.day_of_week] = {
              is_available: rule.is_available ?? false,
              max_duration_minutes: rule.max_duration_minutes?.toString() || "",
              note: rule.note || "",
            };
          });
          setDays(updated);
        }
        setLoading(false);
      });
  }, [user]);

  const updateDay = (i: number, key: keyof DayRule, value: string | boolean) => {
    setDays(prev => prev.map((d, idx) => (idx === i ? { ...d, [key]: value } : d)));
  };

  const handleSave = async () => {
    if (!user) return;

    for (const day of days) {
      if (day.max_duration_minutes && (isNaN(Number(day.max_duration_minutes)) || Number(day.max_duration_minutes) < 0)) {
        toast({ title: "Durée invalide", description: "La durée doit être un nombre positif.", variant: "destructive" });
        return;
      }
    }

    setSaving(true);

    // Delete existing then insert
    await supabase.from("default_availability_rules").delete().eq("user_id", user.id);

    const rows = days.map((d, i) => ({
      user_id: user.id,
      day_of_week: i,
      is_available: d.is_available,
      max_duration_minutes: d.max_duration_minutes ? parseInt(d.max_duration_minutes) : null,
      note: d.note || null,
    }));

    const { error } = await supabase.from("default_availability_rules").insert(rows);
    setSaving(false);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de sauvegarder les disponibilités.", variant: "destructive" });
    } else {
      // Mark onboarding as completed
      await supabase.from("athlete_profiles").update({ onboarding_completed: true }).eq("user_id", user.id);
      toast({ title: "Disponibilités sauvegardées" });
      navigate("/summary");
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
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Vos disponibilités</h1>
          <p className="text-muted-foreground mt-1">Indiquez vos habitudes d'entraînement par jour de la semaine.</p>
        </div>

        <div className="space-y-3">
          {DAYS.map((day, i) => (
            <div key={day} className="bg-card rounded-xl shadow-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-heading font-semibold">{day}</span>
                <Switch checked={days[i].is_available} onCheckedChange={v => updateDay(i, "is_available", v)} />
              </div>
              {days[i].is_available && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-1">
                  <div className="space-y-1">
                    <Label className="text-sm">Durée max (min)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={days[i].max_duration_minutes}
                      onChange={e => updateDay(i, "max_duration_minutes", e.target.value)}
                      placeholder="90"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Note</Label>
                    <Input
                      value={days[i].note}
                      onChange={e => updateDay(i, "note", e.target.value)}
                      placeholder="Séance midi, sortie longue..."
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => navigate("/onboarding/goal")}>Retour</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-gradient-hero text-primary-foreground hover:opacity-90 px-8">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Terminer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
