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

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    display_name: "",
    sex: "",
    date_of_birth: "",
    weight_kg: "",
    height_cm: "",
    country: "",
    city: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    pool_access: false,
    home_trainer: false,
    gym_access: false,
    notes: "",
  });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("athlete_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setForm({
            display_name: data.display_name || "",
            sex: data.sex || "",
            date_of_birth: data.date_of_birth || "",
            weight_kg: data.weight_kg?.toString() || "",
            height_cm: data.height_cm?.toString() || "",
            country: data.country || "",
            city: data.city || "",
            timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            pool_access: data.pool_access || false,
            home_trainer: data.home_trainer || false,
            gym_access: data.gym_access || false,
            notes: data.notes || "",
          });
        }
        setLoading(false);
      });
  }, [user]);

  const update = (key: string, value: string | boolean) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const payload = {
      user_id: user.id,
      display_name: form.display_name || null,
      sex: form.sex || null,
      date_of_birth: form.date_of_birth || null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      height_cm: form.height_cm ? parseFloat(form.height_cm) : null,
      country: form.country || null,
      city: form.city || null,
      timezone: form.timezone || null,
      pool_access: form.pool_access,
      home_trainer: form.home_trainer,
      gym_access: form.gym_access,
      notes: form.notes || null,
    };

    const { error } = await supabase.from("athlete_profiles").upsert(payload, { onConflict: "user_id" });
    setSaving(false);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de sauvegarder le profil.", variant: "destructive" });
    } else {
      toast({ title: "Profil sauvegardé" });
      navigate("/onboarding/goal");
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
          <h1 className="text-2xl sm:text-3xl font-heading font-bold">Votre profil</h1>
          <p className="text-muted-foreground mt-1">Ces informations nous aident à personnaliser votre plan.</p>
        </div>

        <div className="bg-card rounded-xl shadow-card p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prénom / Pseudo</Label>
              <Input value={form.display_name} onChange={e => update("display_name", e.target.value)} placeholder="Votre prénom" />
            </div>
            <div className="space-y-2">
              <Label>Sexe</Label>
              <Select value={form.sex} onValueChange={v => update("sex", v)}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Homme</SelectItem>
                  <SelectItem value="female">Femme</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                  <SelectItem value="prefer_not_to_say">Préfère ne pas dire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date de naissance</Label>
              <Input type="date" value={form.date_of_birth} onChange={e => update("date_of_birth", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Poids (kg)</Label>
              <Input type="number" step="0.1" value={form.weight_kg} onChange={e => update("weight_kg", e.target.value)} placeholder="75" />
            </div>
            <div className="space-y-2">
              <Label>Taille (cm)</Label>
              <Input type="number" step="0.1" value={form.height_cm} onChange={e => update("height_cm", e.target.value)} placeholder="180" />
            </div>
            <div className="space-y-2">
              <Label>Pays</Label>
              <Input value={form.country} onChange={e => update("country", e.target.value)} placeholder="France" />
            </div>
            <div className="space-y-2">
              <Label>Ville</Label>
              <Input value={form.city} onChange={e => update("city", e.target.value)} placeholder="Paris" />
            </div>
            <div className="space-y-2">
              <Label>Fuseau horaire</Label>
              <Input value={form.timezone} onChange={e => update("timezone", e.target.value)} />
            </div>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h3 className="font-heading font-semibold">Équipements & accès</h3>
            <div className="flex items-center justify-between">
              <Label>Accès piscine</Label>
              <Switch checked={form.pool_access} onCheckedChange={v => update("pool_access", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Home trainer</Label>
              <Switch checked={form.home_trainer} onCheckedChange={v => update("home_trainer", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Salle / renforcement</Label>
              <Switch checked={form.gym_access} onCheckedChange={v => update("gym_access", v)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes libres</Label>
            <Textarea value={form.notes} onChange={e => update("notes", e.target.value)} placeholder="Blessures, contraintes, historique sportif..." rows={3} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="bg-gradient-hero text-primary-foreground hover:opacity-90 px-8">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
