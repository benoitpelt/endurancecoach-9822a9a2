
-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Athlete profiles
CREATE TABLE public.athlete_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  display_name TEXT,
  sex TEXT CHECK (sex IN ('male', 'female', 'other', 'prefer_not_to_say')),
  date_of_birth DATE,
  weight_kg NUMERIC(5,1),
  height_cm NUMERIC(5,1),
  country TEXT,
  city TEXT,
  timezone TEXT,
  pool_access BOOLEAN DEFAULT false,
  home_trainer BOOLEAN DEFAULT false,
  gym_access BOOLEAN DEFAULT false,
  notes TEXT,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.athlete_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.athlete_profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.athlete_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.athlete_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_athlete_profiles_updated_at
  BEFORE UPDATE ON public.athlete_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Race goals
CREATE TABLE public.race_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('triathlon', 'running', 'cycling')),
  format TEXT,
  is_competition BOOLEAN DEFAULT false,
  event_name TEXT,
  target_date DATE,
  location TEXT,
  primary_objective TEXT,
  secondary_objective TEXT,
  target_time TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.race_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own goals" ON public.race_goals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own goals" ON public.race_goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own goals" ON public.race_goals
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own goals" ON public.race_goals
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_race_goals_updated_at
  BEFORE UPDATE ON public.race_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Default availability rules
CREATE TABLE public.default_availability_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_available BOOLEAN DEFAULT false,
  max_duration_minutes INTEGER,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, day_of_week)
);

ALTER TABLE public.default_availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own availability" ON public.default_availability_rules
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own availability" ON public.default_availability_rules
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own availability" ON public.default_availability_rules
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own availability" ON public.default_availability_rules
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_availability_rules_updated_at
  BEFORE UPDATE ON public.default_availability_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
