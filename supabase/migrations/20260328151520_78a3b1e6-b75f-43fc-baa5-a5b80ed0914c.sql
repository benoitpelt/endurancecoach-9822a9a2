
CREATE TABLE public.strava_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  strava_athlete_id bigint,
  access_token text,
  refresh_token text,
  token_expires_at timestamp with time zone,
  connected_at timestamp with time zone DEFAULT now(),
  last_import_at timestamp with time zone,
  import_status text DEFAULT 'none',
  import_activity_count integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own strava connection" ON public.strava_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own strava connection" ON public.strava_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own strava connection" ON public.strava_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own strava connection" ON public.strava_connections FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.imported_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  strava_id bigint NOT NULL,
  name text,
  sport_type_raw text,
  sport_type_normalized text,
  start_date timestamp with time zone,
  timezone text,
  duration_seconds integer,
  moving_time_seconds integer,
  distance_meters numeric,
  elevation_gain_meters numeric,
  avg_heartrate numeric,
  max_heartrate numeric,
  avg_power numeric,
  max_power numeric,
  avg_speed numeric,
  max_speed numeric,
  calories numeric,
  raw_payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, strava_id)
);

ALTER TABLE public.imported_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activities" ON public.imported_activities FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activities" ON public.imported_activities FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own activities" ON public.imported_activities FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own activities" ON public.imported_activities FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_strava_connections_updated_at BEFORE UPDATE ON public.strava_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_imported_activities_updated_at BEFORE UPDATE ON public.imported_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
