
-- training_plans
CREATE TABLE public.training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  goal_id uuid REFERENCES public.race_goals(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plans" ON public.training_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own plans" ON public.training_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plans" ON public.training_plans FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_training_plans_updated_at BEFORE UPDATE ON public.training_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- training_blocks
CREATE TABLE public.training_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  block_order integer NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  focus text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks" ON public.training_blocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own blocks" ON public.training_blocks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own blocks" ON public.training_blocks FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_training_blocks_updated_at BEFORE UPDATE ON public.training_blocks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- training_weeks
CREATE TABLE public.training_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES public.training_blocks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  week_number integer NOT NULL,
  week_type text NOT NULL DEFAULT 'normal',
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.training_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weeks" ON public.training_weeks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own weeks" ON public.training_weeks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own weeks" ON public.training_weeks FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_training_weeks_updated_at BEFORE UPDATE ON public.training_weeks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- planned_workouts
CREATE TABLE public.planned_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES public.training_weeks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  sport_type text NOT NULL,
  scheduled_date date,
  workout_priority text NOT NULL DEFAULT 'important',
  status text NOT NULL DEFAULT 'planned',
  session_goal text,
  duration_target_minutes integer,
  distance_target_km numeric,
  intensity_zone_label text,
  structure_text text,
  coach_note_short text,
  created_by_type text DEFAULT 'manual',
  carb_strategy_type text,
  carb_before_g numeric,
  carb_during_g_per_hour numeric,
  carb_total_target_g numeric,
  hydration_note text,
  gut_training_priority text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planned_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workouts" ON public.planned_workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own workouts" ON public.planned_workouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workouts" ON public.planned_workouts FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_planned_workouts_updated_at BEFORE UPDATE ON public.planned_workouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_training_blocks_plan_id ON public.training_blocks(plan_id);
CREATE INDEX idx_training_weeks_block_id ON public.training_weeks(block_id);
CREATE INDEX idx_planned_workouts_week_id ON public.planned_workouts(week_id);
CREATE INDEX idx_planned_workouts_date ON public.planned_workouts(user_id, scheduled_date);

-- Enable realtime for plan updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.training_plans;
