import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast({ title: "Erreur de connexion", description: error.message, variant: "destructive" });
    } else {
      navigate("/welcome");
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email envoyé", description: "Vérifiez votre boîte de réception." });
      setResetMode(false);
    }
  };

  if (resetMode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-heading font-bold text-gradient">EnduranceCoach</h1>
            <p className="mt-2 text-muted-foreground">Réinitialisez votre mot de passe</p>
          </div>
          <form onSubmit={handleReset} className="bg-card rounded-xl shadow-card p-6 sm:p-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input id="reset-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" />
            </div>
            <Button type="submit" className="w-full bg-gradient-hero text-primary-foreground hover:opacity-90" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer le lien"}
            </Button>
            <button type="button" onClick={() => setResetMode(false)} className="w-full text-sm text-primary hover:underline">
              Retour à la connexion
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-heading font-bold text-gradient">EnduranceCoach</h1>
          <p className="mt-2 text-muted-foreground">Connectez-vous</p>
        </div>
        <form onSubmit={handleLogin} className="bg-card rounded-xl shadow-card p-6 sm:p-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full bg-gradient-hero text-primary-foreground hover:opacity-90" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se connecter"}
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" onClick={() => setResetMode(true)} className="text-primary hover:underline">
              Mot de passe oublié ?
            </button>
            <Link to="/signup" className="text-primary hover:underline">Créer un compte</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
