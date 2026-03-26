import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Activity, Target, Calendar, TrendingUp } from "lucide-react";

const steps = [
  { icon: Activity, title: "Créez votre profil", desc: "Renseignez vos informations d'athlète" },
  { icon: Target, title: "Définissez votre objectif", desc: "Course, triathlon ou vélo" },
  { icon: Calendar, title: "Indiquez vos disponibilités", desc: "Pour un plan adapté à votre vie" },
  { icon: TrendingUp, title: "Recevez votre plan", desc: "Un programme personnalisé" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <header className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold font-heading tracking-tight">
            <span className="text-gradient">EnduranceCoach</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-lg mx-auto">
            Votre coach d'endurance intelligent. Triathlon, course à pied, vélo — un plan d'entraînement adapté à vos objectifs et votre vie.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button asChild size="lg" className="bg-gradient-hero text-primary-foreground hover:opacity-90 transition-opacity text-base px-8">
              <Link to="/signup">Créer un compte</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base px-8">
              <Link to="/login">Se connecter</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* How it works */}
      <section className="py-16 px-4 bg-gradient-subtle">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-center mb-12">
            Comment ça marche
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <div key={i} className="bg-card rounded-xl p-6 shadow-card text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-gradient-hero flex items-center justify-center">
                  <step.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-heading font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} EnduranceCoach
      </footer>
    </div>
  );
}
