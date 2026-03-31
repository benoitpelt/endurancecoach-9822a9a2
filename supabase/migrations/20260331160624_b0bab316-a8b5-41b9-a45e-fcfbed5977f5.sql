
-- 1. weekly_constraints: saisie des contraintes hebdomadaires
CREATE TABLE public.weekly_constraints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_id uuid NOT NULL REFERENCES public.training_weeks(id) ON DELETE CASCADE,
  perceived_fatigue integer, -- 1-5
  life_load integer, -- 1-5
  unavailable_days jsonb DEFAULT '[]'::jsonb, -- array of day numbers 0-6
  max_duration_per_day jsonb DEFAULT '{}'::jsonb, -- {0: 45, 3: 60}
  weekend_constraint text, -- 'free', 'limited', 'unavailable'
  free_text text,
  sport_preferences_per_day jsonb DEFAULT '{}'::jsonb, -- {1: "bike", 3: "run"}
  explicit_requests jsonb DEFAULT '[]'::jsonb, -- [{type: "move", workout_id: "...", target_day: 1}, {type: "protect", workout_id: "..."}]
  status text NOT NULL DEFAULT 'draft', -- draft, submitted, processed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_constraints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own constraints" ON public.weekly_constraints FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own constraints" ON public.weekly_constraints FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own constraints" ON public.weekly_constraints FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own constraints" ON public.weekly_constraints FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2. weekly_adjustment_proposals: propositions de réorganisation
CREATE TABLE public.weekly_adjustment_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_id uuid NOT NULL REFERENCES public.training_weeks(id) ON DELETE CASCADE,
  constraint_id uuid REFERENCES public.weekly_constraints(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, accepted, rejected
  proposed_workouts jsonb NOT NULL DEFAULT '[]'::jsonb,
  original_workouts jsonb NOT NULL DEFAULT '[]'::jsonb,
  changes_summary text,
  detailed_explanation text,
  protected_workouts jsonb DEFAULT '[]'::jsonb,
  sacrificed_workouts jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_adjustment_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own proposals" ON public.weekly_adjustment_proposals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own proposals" ON public.weekly_adjustment_proposals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own proposals" ON public.weekly_adjustment_proposals FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own proposals" ON public.weekly_adjustment_proposals FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 3. planned_workout_versions: historisation des séances modifiées
CREATE TABLE public.planned_workout_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL REFERENCES public.planned_workouts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  snapshot jsonb NOT NULL, -- full workout data at that version
  change_reason text,
  adjustment_id uuid, -- will reference plan_adjustments
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.planned_workout_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own versions" ON public.planned_workout_versions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own versions" ON public.planned_workout_versions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 4. plan_adjustments: historique des ajustements appliqués
CREATE TABLE public.plan_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  week_id uuid NOT NULL REFERENCES public.training_weeks(id) ON DELETE CASCADE,
  constraint_id uuid REFERENCES public.weekly_constraints(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.weekly_adjustment_proposals(id) ON DELETE SET NULL,
  adjustment_type text NOT NULL DEFAULT 'weekly_reorganization',
  reason_summary text,
  detailed_summary text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own adjustments" ON public.plan_adjustments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own adjustments" ON public.plan_adjustments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 5. adjustment_impacted_workouts: séances impactées par un ajustement
CREATE TABLE public.adjustment_impacted_workouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id uuid NOT NULL REFERENCES public.plan_adjustments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  workout_id uuid NOT NULL REFERENCES public.planned_workouts(id) ON DELETE CASCADE,
  change_type text NOT NULL, -- 'moved', 'lightened', 'cancelled', 'reprioritized', 'replaced', 'kept'
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.adjustment_impacted_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own impacted workouts" ON public.adjustment_impacted_workouts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own impacted workouts" ON public.adjustment_impacted_workouts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Add foreign key for planned_workout_versions.adjustment_id
ALTER TABLE public.planned_workout_versions ADD CONSTRAINT planned_workout_versions_adjustment_id_fkey FOREIGN KEY (adjustment_id) REFERENCES public.plan_adjustments(id) ON DELETE SET NULL;
