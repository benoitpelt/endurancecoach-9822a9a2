import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function WelcomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) return;
    // Check if profile already exists and onboarding completed
    supabase
      .from("athlete_profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.onboarding_completed) {
          navigate("/summary", { replace: true });
        }
        setChecking(false);
      });
  }, [user, navigate]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-lg text-center space-y-6">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold">
          Bienvenue sur <span className="text-gradient">EnduranceCoach</span> 🎉
        </h1>
        <p className="text-muted-foreground text-lg">
          Nous allons commencer par comprendre votre profil d'athlète, votre objectif et vos disponibilités.
          C'est rapide — environ 3 minutes.
        </p>
        <Button
          size="lg"
          className="bg-gradient-hero text-primary-foreground hover:opacity-90 text-base px-10"
          onClick={() => navigate("/onboarding/profile")}
        >
          Commencer
        </Button>
      </div>
    </div>
  );
}
