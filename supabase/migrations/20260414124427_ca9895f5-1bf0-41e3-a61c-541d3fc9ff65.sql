
CREATE TABLE public.plan_regenerations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_plan_id uuid NOT NULL,
  generated_plan_id uuid NOT NULL,
  reason text,
  restored_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_regenerations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own regenerations"
  ON public.plan_regenerations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own regenerations"
  ON public.plan_regenerations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own regenerations"
  ON public.plan_regenerations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
