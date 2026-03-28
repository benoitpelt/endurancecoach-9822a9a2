
CREATE POLICY "Users can delete own profile" ON athlete_profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own enriched profile" ON athlete_enriched_profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own metrics" ON athlete_metric_history
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
