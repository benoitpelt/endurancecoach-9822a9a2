-- Fix 1: race_goals DELETE policy - change from public to authenticated
DROP POLICY "Users can delete own goals" ON race_goals;
CREATE POLICY "Users can delete own goals" ON race_goals
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Fix 2: Remove training_plans from realtime publication to prevent cross-user data leakage
ALTER PUBLICATION supabase_realtime DROP TABLE public.training_plans;