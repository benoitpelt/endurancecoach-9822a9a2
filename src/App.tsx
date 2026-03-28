import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import LandingPage from "@/pages/LandingPage";
import SignupPage from "@/pages/SignupPage";
import LoginPage from "@/pages/LoginPage";
import WelcomePage from "@/pages/WelcomePage";
import ProfilePage from "@/pages/ProfilePage";
import GoalPage from "@/pages/GoalPage";
import AvailabilityPage from "@/pages/AvailabilityPage";
import SummaryPage from "@/pages/SummaryPage";
import EnrichedOnboardingPage from "@/pages/EnrichedOnboardingPage";
import EnrichedSummaryPage from "@/pages/EnrichedSummaryPage";
import PlanPage from "@/pages/PlanPage";
import WeekPage from "@/pages/WeekPage";
import WorkoutDetailPage from "@/pages/WorkoutDetailPage";
import StravaPage from "@/pages/StravaPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/welcome" element={<ProtectedRoute><WelcomePage /></ProtectedRoute>} />
            <Route path="/onboarding/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/onboarding/goal" element={<ProtectedRoute><GoalPage /></ProtectedRoute>} />
            <Route path="/onboarding/availability" element={<ProtectedRoute><AvailabilityPage /></ProtectedRoute>} />
            <Route path="/summary" element={<ProtectedRoute><SummaryPage /></ProtectedRoute>} />
            <Route path="/onboarding/enriched" element={<ProtectedRoute><EnrichedOnboardingPage /></ProtectedRoute>} />
            <Route path="/onboarding/enriched/summary" element={<ProtectedRoute><EnrichedSummaryPage /></ProtectedRoute>} />
            <Route path="/plan" element={<ProtectedRoute><PlanPage /></ProtectedRoute>} />
            <Route path="/plan/week/:weekId" element={<ProtectedRoute><WeekPage /></ProtectedRoute>} />
            <Route path="/plan/workout/:workoutId" element={<ProtectedRoute><WorkoutDetailPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
