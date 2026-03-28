
-- Remove client SELECT access to strava_connections to prevent token exposure.
-- All reads happen through edge functions using service role key.
DROP POLICY IF EXISTS "Users can view own strava connection" ON strava_connections;

-- Also remove client INSERT/UPDATE since all writes go through edge functions too.
DROP POLICY IF EXISTS "Users can insert own strava connection" ON strava_connections;
DROP POLICY IF EXISTS "Users can update own strava connection" ON strava_connections;
DROP POLICY IF EXISTS "Users can delete own strava connection" ON strava_connections;
