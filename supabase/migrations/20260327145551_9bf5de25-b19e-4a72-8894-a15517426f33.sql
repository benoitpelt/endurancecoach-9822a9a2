CREATE POLICY "Users can delete own plans"
ON public.training_plans FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own blocks"
ON public.training_blocks FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own weeks"
ON public.training_weeks FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workouts"
ON public.planned_workouts FOR DELETE TO authenticated
USING (auth.uid() = user_id);