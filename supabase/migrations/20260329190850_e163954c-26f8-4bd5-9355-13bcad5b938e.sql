
-- completed_workouts: links imported_activities to planned_workouts
CREATE TABLE public.completed_workouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  imported_activity_id UUID REFERENCES public.imported_activities(id) ON DELETE CASCADE,
  planned_workout_id UUID REFERENCES public.planned_workouts(id) ON DELETE SET NULL,
  sport_type TEXT NOT NULL,
  matching_status TEXT NOT NULL DEFAULT 'unmatched',
  conformity_status TEXT DEFAULT 'pending',
  start_date TIMESTAMPTZ,
  duration_seconds INTEGER,
  moving_time_seconds INTEGER,
  distance_meters NUMERIC,
  elevation_gain_meters NUMERIC,
  avg_heartrate NUMERIC,
  max_heartrate NUMERIC,
  avg_power NUMERIC,
  avg_speed NUMERIC,
  calories NUMERIC,
  activity_name TEXT,
  short_analysis TEXT,
  requires_adjustment_review BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(imported_activity_id)
);

ALTER TABLE public.completed_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own completed workouts" ON public.completed_workouts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own completed workouts" ON public.completed_workouts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own completed workouts" ON public.completed_workouts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own completed workouts" ON public.completed_workouts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_completed_workouts_updated_at BEFORE UPDATE ON public.completed_workouts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- completed_workout_feedback: optional user feedback post-session
CREATE TABLE public.completed_workout_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  completed_workout_id UUID NOT NULL REFERENCES public.completed_workouts(id) ON DELETE CASCADE,
  rpe INTEGER,
  fatigue_after INTEGER,
  comment_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(completed_workout_id)
);

ALTER TABLE public.completed_workout_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback" ON public.completed_workout_feedback FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own feedback" ON public.completed_workout_feedback FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own feedback" ON public.completed_workout_feedback FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own feedback" ON public.completed_workout_feedback FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_completed_workout_feedback_updated_at BEFORE UPDATE ON public.completed_workout_feedback FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- workout_analyses: short and detailed analyses
CREATE TABLE public.workout_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  completed_workout_id UUID NOT NULL REFERENCES public.completed_workouts(id) ON DELETE CASCADE,
  analysis_type TEXT NOT NULL DEFAULT 'short',
  conformity_status TEXT,
  planned_summary TEXT,
  actual_summary TEXT,
  comparison_text TEXT,
  interpretation_text TEXT,
  vigilance_signals JSONB DEFAULT '[]'::jsonb,
  requires_adjustment_review BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses" ON public.workout_analyses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own analyses" ON public.workout_analyses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own analyses" ON public.workout_analyses FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own analyses" ON public.workout_analyses FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_workout_analyses_updated_at BEFORE UPDATE ON public.workout_analyses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update planned_workouts status to track completion
-- (status already exists with default 'planned', we'll use 'completed' and 'missed')
