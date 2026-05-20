ALTER TABLE public.imported_activities
  ADD COLUMN IF NOT EXISTS splits_metric jsonb,
  ADD COLUMN IF NOT EXISTS laps jsonb,
  ADD COLUMN IF NOT EXISTS details_fetched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_imported_activities_details_pending
  ON public.imported_activities (user_id, start_date DESC)
  WHERE details_fetched_at IS NULL
    AND sport_type_normalized IN ('swim', 'bike', 'run');