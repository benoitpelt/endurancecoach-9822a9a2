
CREATE TABLE public.goal_trajectory_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  goal_id uuid NOT NULL,
  plan_id uuid,
  trajectory_status text NOT NULL DEFAULT 'on_track',
  realism_score_percent integer NOT NULL DEFAULT 50,
  summary_short text,
  summary_detailed text,
  supporting_points jsonb DEFAULT '[]'::jsonb,
  weakening_points jsonb DEFAULT '[]'::jsonb,
  discipline_breakdown jsonb DEFAULT '{}'::jsonb,
  suggests_plan_review boolean DEFAULT false,
  trigger_event text,
  raw_input jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.goal_trajectory_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots" ON public.goal_trajectory_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own snapshots" ON public.goal_trajectory_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_trajectory_snapshots_user_goal ON public.goal_trajectory_snapshots (user_id, goal_id, created_at DESC);
