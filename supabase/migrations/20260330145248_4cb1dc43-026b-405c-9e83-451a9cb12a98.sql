
-- 1. Add RLS policies to strava_connections (currently has RLS enabled but NO policies)
CREATE POLICY "owner_select" ON public.strava_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner_insert" ON public.strava_connections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_update" ON public.strava_connections FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner_delete" ON public.strava_connections FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 2. Restrict write policies from 'public' to 'authenticated' on all affected tables

-- athlete_profiles
ALTER POLICY "Users can insert own profile" ON public.athlete_profiles TO authenticated;
ALTER POLICY "Users can update own profile" ON public.athlete_profiles TO authenticated;
ALTER POLICY "Users can view own profile" ON public.athlete_profiles TO authenticated;

-- athlete_enriched_profiles
ALTER POLICY "Users can insert own enriched profile" ON public.athlete_enriched_profiles TO authenticated;
ALTER POLICY "Users can update own enriched profile" ON public.athlete_enriched_profiles TO authenticated;
ALTER POLICY "Users can view own enriched profile" ON public.athlete_enriched_profiles TO authenticated;

-- athlete_metric_history
ALTER POLICY "Users can insert own metrics" ON public.athlete_metric_history TO authenticated;
ALTER POLICY "Users can update own metrics" ON public.athlete_metric_history TO authenticated;
ALTER POLICY "Users can view own metrics" ON public.athlete_metric_history TO authenticated;

-- training_plans
ALTER POLICY "Users can insert own plans" ON public.training_plans TO authenticated;
ALTER POLICY "Users can update own plans" ON public.training_plans TO authenticated;
ALTER POLICY "Users can view own plans" ON public.training_plans TO authenticated;

-- training_blocks
ALTER POLICY "Users can insert own blocks" ON public.training_blocks TO authenticated;
ALTER POLICY "Users can update own blocks" ON public.training_blocks TO authenticated;
ALTER POLICY "Users can view own blocks" ON public.training_blocks TO authenticated;

-- training_weeks
ALTER POLICY "Users can insert own weeks" ON public.training_weeks TO authenticated;
ALTER POLICY "Users can update own weeks" ON public.training_weeks TO authenticated;
ALTER POLICY "Users can view own weeks" ON public.training_weeks TO authenticated;

-- planned_workouts
ALTER POLICY "Users can insert own workouts" ON public.planned_workouts TO authenticated;
ALTER POLICY "Users can update own workouts" ON public.planned_workouts TO authenticated;
ALTER POLICY "Users can view own workouts" ON public.planned_workouts TO authenticated;

-- race_goals
ALTER POLICY "Users can insert own goals" ON public.race_goals TO authenticated;
ALTER POLICY "Users can update own goals" ON public.race_goals TO authenticated;
ALTER POLICY "Users can view own goals" ON public.race_goals TO authenticated;

-- imported_activities
ALTER POLICY "Users can insert own activities" ON public.imported_activities TO authenticated;
ALTER POLICY "Users can update own activities" ON public.imported_activities TO authenticated;
ALTER POLICY "Users can view own activities" ON public.imported_activities TO authenticated;
ALTER POLICY "Users can delete own activities" ON public.imported_activities TO authenticated;

-- default_availability_rules
ALTER POLICY "Users can insert own availability" ON public.default_availability_rules TO authenticated;
ALTER POLICY "Users can update own availability" ON public.default_availability_rules TO authenticated;
ALTER POLICY "Users can view own availability" ON public.default_availability_rules TO authenticated;
ALTER POLICY "Users can delete own availability" ON public.default_availability_rules TO authenticated;
