
-- Vue des splits (kilomètre par kilomètre)
CREATE OR REPLACE VIEW public.activity_splits AS
SELECT
  ia.id AS activity_id,
  ia.user_id,
  ia.name,
  ia.start_date,
  ia.sport_type_normalized,
  (elem->>'split')::int AS km,
  (elem->>'distance')::numeric AS distance_m,
  (elem->>'moving_time')::int AS moving_time_sec,
  (elem->>'elapsed_time')::int AS elapsed_time_sec,
  (elem->>'elevation_difference')::numeric AS elevation_diff_m,
  (elem->>'average_speed')::numeric AS avg_speed_ms,
  (elem->>'average_heartrate')::numeric AS avg_heartrate,
  COALESCE((elem->>'average_watts')::numeric, (elem->>'avg_watts')::numeric) AS avg_watts,
  (elem->>'pace_zone')::int AS pace_zone
FROM public.imported_activities ia,
     LATERAL jsonb_array_elements(ia.splits_metric) AS elem
WHERE ia.splits_metric IS NOT NULL
  AND jsonb_typeof(ia.splits_metric) = 'array';

-- Vue des laps
CREATE OR REPLACE VIEW public.activity_laps AS
SELECT
  ia.id AS activity_id,
  ia.user_id,
  ia.name,
  ia.start_date,
  ia.sport_type_normalized,
  (elem->>'lap_index')::int AS lap_index,
  elem->>'name' AS lap_name,
  (elem->>'distance')::numeric AS distance_m,
  (elem->>'moving_time')::int AS moving_time_sec,
  (elem->>'elapsed_time')::int AS elapsed_time_sec,
  (elem->>'total_elevation_gain')::numeric AS elevation_gain_m,
  (elem->>'average_speed')::numeric AS avg_speed_ms,
  (elem->>'max_speed')::numeric AS max_speed_ms,
  (elem->>'average_heartrate')::numeric AS avg_heartrate,
  (elem->>'max_heartrate')::numeric AS max_heartrate,
  COALESCE((elem->>'average_watts')::numeric, (elem->>'avg_watts')::numeric) AS avg_watts,
  (elem->>'average_cadence')::numeric AS avg_cadence,
  (elem->>'start_index')::int AS start_index,
  (elem->>'end_index')::int AS end_index
FROM public.imported_activities ia,
     LATERAL jsonb_array_elements(ia.laps) AS elem
WHERE ia.laps IS NOT NULL
  AND jsonb_typeof(ia.laps) = 'array';
