
-- Table 1: athlete_enriched_profiles
CREATE TABLE public.athlete_enriched_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sport_experience jsonb DEFAULT '{}',
  current_frequency_per_week integer,
  strongest_discipline text,
  weakest_discipline text,
  weekly_volume_hours jsonb DEFAULT '{}',
  sessions_per_week integer,
  longest_recent_swim text,
  longest_recent_bike text,
  longest_recent_run text,
  typical_sessions text,
  performances jsonb DEFAULT '{}',
  injuries_constraints text,
  preferred_sessions text,
  disliked_sessions text,
  max_sessions_per_week integer,
  double_sessions boolean DEFAULT false,
  strength_training boolean DEFAULT false,
  time_preference text,
  plan_failure_reason text,
  enriched_onboarding_completed boolean DEFAULT false
);

ALTER TABLE public.athlete_enriched_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own enriched profile" ON public.athlete_enriched_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own enriched profile" ON public.athlete_enriched_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own enriched profile" ON public.athlete_enriched_profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_athlete_enriched_profiles_updated_at
  BEFORE UPDATE ON public.athlete_enriched_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 2: athlete_metric_history
CREATE TABLE public.athlete_metric_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  metric_type text NOT NULL,
  metric_value numeric,
  metric_unit text,
  observed_at timestamptz DEFAULT now(),
  source_type text,
  source_detail text,
  confidence_score numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.athlete_metric_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics" ON public.athlete_metric_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own metrics" ON public.athlete_metric_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own metrics" ON public.athlete_metric_history FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_athlete_metric_history_updated_at
  BEFORE UPDATE ON public.athlete_metric_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_athlete_metric_history_user_type_date ON public.athlete_metric_history (user_id, metric_type, observed_at DESC);
