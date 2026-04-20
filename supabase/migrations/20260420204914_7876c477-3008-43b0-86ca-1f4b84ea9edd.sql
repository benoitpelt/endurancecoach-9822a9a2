-- Table de cache pour les insights de performance générés par IA
CREATE TABLE public.performance_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  period_days INTEGER NOT NULL,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  vigilance JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  data_summary JSONB,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.performance_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own performance insights"
  ON public.performance_insights FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own performance insights"
  ON public.performance_insights FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own performance insights"
  ON public.performance_insights FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_performance_insights_user_period ON public.performance_insights(user_id, period_days, generated_at DESC);