

# Lot 2 — Revised Plan: Enriched Onboarding + Athlete Metric History

## Key Change from Previous Plan

Physiological metrics (HR max, FTP, CSS, paces, weight) are **removed from `athlete_enriched_profiles`** and stored in a dedicated **`athlete_metric_history`** table. On wizard validation, metrics are inserted into `athlete_metric_history` while the rest goes to `athlete_enriched_profiles`.

---

## Database Changes

### Table 1: `athlete_enriched_profiles` (no metric columns)

```sql
CREATE TABLE public.athlete_enriched_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- History & current practice
  sport_experience jsonb DEFAULT '{}',
  current_frequency_per_week integer,
  strongest_discipline text,
  weakest_discipline text,

  -- Volumes & longest sessions
  weekly_volume_hours jsonb DEFAULT '{}',
  sessions_per_week integer,
  longest_recent_swim text,
  longest_recent_bike text,
  longest_recent_run text,
  typical_sessions text,

  -- Past performances (structured JSONB)
  performances jsonb DEFAULT '{}',

  -- Constraints & preferences (NO metrics here)
  injuries_constraints text,
  preferred_sessions text,
  disliked_sessions text,
  max_sessions_per_week integer,
  double_sessions boolean DEFAULT false,
  strength_training boolean DEFAULT false,
  time_preference text,
  plan_failure_reason text,

  enriched_onboarding_completed boolean DEFAULT false
);
-- RLS: same pattern (SELECT/INSERT/UPDATE for auth.uid() = user_id)
-- Trigger: update_updated_at_column
```

### Table 2: `athlete_metric_history` (new, historizable)

```sql
CREATE TABLE public.athlete_metric_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  metric_type text NOT NULL,
  metric_value numeric,
  metric_unit text,
  observed_at timestamptz DEFAULT now(),
  source_type text,        -- e.g. 'onboarding', 'manual', 'strava', 'test'
  source_detail text,
  confidence_score numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: SELECT/INSERT/UPDATE for auth.uid() = user_id
-- Trigger: update_updated_at_column
-- Index on (user_id, metric_type, observed_at)
```

Supported `metric_type` values (used as conventions, not an enum for flexibility):
`hr_max`, `hr_rest`, `ftp`, `threshold_pace_run`, `css`, `pace_100m_max`, `pace_100m_easy`, `weight`

---

## Routing (unchanged)

- `/onboarding/enriched` → wizard (protected)
- `/onboarding/enriched/summary` → athlete bilan (protected)

## Files Created

| File | Purpose |
|------|---------|
| `src/pages/EnrichedOnboardingPage.tsx` | Wizard container (6 steps + progress bar) |
| `src/components/onboarding/StepIntro.tsx` | Introduction screen |
| `src/components/onboarding/StepHistory.tsx` | Sport history & current practice |
| `src/components/onboarding/StepVolumes.tsx` | Volumes & longest recent sessions |
| `src/components/onboarding/StepPerformances.tsx` | Past performances by sport (tabbed) |
| `src/components/onboarding/StepMetrics.tsx` | Physiological metrics with "Je ne sais pas" |
| `src/components/onboarding/StepConstraints.tsx` | Constraints, preferences, plan failure reason |
| `src/pages/EnrichedSummaryPage.tsx` | Athlete bilan with completeness score |

## Files Modified

| File | Change |
|------|--------|
| `src/App.tsx` | Add 2 routes |
| `src/pages/SummaryPage.tsx` | Add "Affiner mon profil" CTA |

## Save Logic on Final Validation

1. **Upsert** to `athlete_enriched_profiles` — all non-metric data (history, volumes, performances, constraints, preferences) + set `enriched_onboarding_completed = true`
2. **Insert** into `athlete_metric_history` — one row per known metric, with:
   - `source_type = 'onboarding'`
   - `observed_at = now()`
   - `metric_unit` set appropriately (bpm, watts, min/km, min/100m, kg)
   - Skip metrics where user clicked "Je ne sais pas"

## Summary Page (Bilan Athlète)

- Reads metrics from `athlete_metric_history` (latest per metric_type) for the "known metrics" section
- Reads enriched profile from `athlete_enriched_profiles` for everything else
- Completeness score computed across both sources
- Uncertainty zones = metrics with no entry in `athlete_metric_history`
- Coherence assessment = simple rule-based check against `race_goals`
- Edit buttons per block → navigate back to wizard at relevant step

## Everything Else: Unchanged

Same wizard UX, progress bar, back/skip navigation, no partial save, coach tone, protected routes, mobile-responsive design, Lot 1 integration.

