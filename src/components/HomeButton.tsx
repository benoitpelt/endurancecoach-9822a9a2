import { useLocation, useNavigate } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const HIDDEN_ROUTES = ["/summary", "/welcome", "/"];

export default function HomeButton() {
  const location = useLocation();
  const navigate = useNavigate();

  if (HIDDEN_ROUTES.includes(location.pathname)) return null;

  return (
    <Button
      onClick={() => navigate("/summary")}
      size="icon"
      aria-label="Retour à l'accueil"
      className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg bg-primary text-primary-foreground hover:opacity-90"
    >
      <Home className="h-5 w-5" />
    </Button>
  );
}
