ALTER TABLE public.planned_workouts
  ADD COLUMN IF NOT EXISTS distance_target_meters numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS target_summary_label text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS primary_target_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS primary_target_value_text text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS secondary_target_value_text text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS warmup_summary text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS main_set_summary text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cooldown_summary text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS workout_structure_json jsonb DEFAULT NULL;