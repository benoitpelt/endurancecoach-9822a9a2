import { Button } from "@/components/ui/button";
import { Sparkles, Clock, SkipForward } from "lucide-react";

interface StepIntroProps {
  onNext: () => void;
}

export default function StepIntro({ onNext }: StepIntroProps) {
  return (
    <div className="max-w-xl mx-auto text-center space-y-8">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 bg-gradient-subtle rounded-full px-4 py-1.5 text-sm font-medium text-primary">
          <Sparkles className="h-4 w-4" /> Profil enrichi
        </div>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold">
          Apprenons à mieux te connaître
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Cette étape va nous permettre de comprendre ton niveau réel, tes habitudes et tes contraintes.
          Plus ton profil est complet, plus ton futur plan d'entraînement sera pertinent et adapté.
        </p>
      </div>

      <div className="bg-card rounded-xl shadow-card p-6 text-left space-y-4">
        <h2 className="font-heading font-semibold text-lg">Ce qu'on va aborder</h2>
        <ul className="space-y-3 text-sm">
          {[
            "Ton expérience sportive et ta pratique actuelle",
            "Tes volumes d'entraînement récents",
            "Tes meilleures performances par sport",
            "Tes repères physiologiques (si tu les connais)",
            "Tes contraintes, limites et préférences",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <span className="text-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          <span>Environ 5-10 minutes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <SkipForward className="h-4 w-4" />
          <span>Tu peux sauter les questions</span>
        </div>
      </div>

      <Button size="lg" className="px-10" onClick={onNext}>
        Commencer
      </Button>
    </div>
  );
}
