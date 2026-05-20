export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      adjustment_impacted_workouts: {
        Row: {
          adjustment_id: string
          change_type: string
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          user_id: string
          workout_id: string
        }
        Insert: {
          adjustment_id: string
          change_type: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id: string
          workout_id: string
        }
        Update: {
          adjustment_id?: string
          change_type?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adjustment_impacted_workouts_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "plan_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjustment_impacted_workouts_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "planned_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_enriched_profiles: {
        Row: {
          created_at: string
          current_frequency_per_week: number | null
          disliked_sessions: string | null
          double_sessions: boolean | null
          enriched_onboarding_completed: boolean | null
          id: string
          injuries_constraints: string | null
          longest_recent_bike: string | null
          longest_recent_run: string | null
          longest_recent_swim: string | null
          max_sessions_per_week: number | null
          performances: Json | null
          plan_failure_reason: string | null
          preferred_sessions: string | null
          sessions_per_week: number | null
          sport_experience: Json | null
          strength_training: boolean | null
          strongest_discipline: string | null
          time_preference: string | null
          typical_sessions: string | null
          updated_at: string
          user_id: string
          weakest_discipline: string | null
          weekly_volume_hours: Json | null
        }
        Insert: {
          created_at?: string
          current_frequency_per_week?: number | null
          disliked_sessions?: string | null
          double_sessions?: boolean | null
          enriched_onboarding_completed?: boolean | null
          id?: string
          injuries_constraints?: string | null
          longest_recent_bike?: string | null
          longest_recent_run?: string | null
          longest_recent_swim?: string | null
          max_sessions_per_week?: number | null
          performances?: Json | null
          plan_failure_reason?: string | null
          preferred_sessions?: string | null
          sessions_per_week?: number | null
          sport_experience?: Json | null
          strength_training?: boolean | null
          strongest_discipline?: string | null
          time_preference?: string | null
          typical_sessions?: string | null
          updated_at?: string
          user_id: string
          weakest_discipline?: string | null
          weekly_volume_hours?: Json | null
        }
        Update: {
          created_at?: string
          current_frequency_per_week?: number | null
          disliked_sessions?: string | null
          double_sessions?: boolean | null
          enriched_onboarding_completed?: boolean | null
          id?: string
          injuries_constraints?: string | null
          longest_recent_bike?: string | null
          longest_recent_run?: string | null
          longest_recent_swim?: string | null
          max_sessions_per_week?: number | null
          performances?: Json | null
          plan_failure_reason?: string | null
          preferred_sessions?: string | null
          sessions_per_week?: number | null
          sport_experience?: Json | null
          strength_training?: boolean | null
          strongest_discipline?: string | null
          time_preference?: string | null
          typical_sessions?: string | null
          updated_at?: string
          user_id?: string
          weakest_discipline?: string | null
          weekly_volume_hours?: Json | null
        }
        Relationships: []
      }
      athlete_metric_history: {
        Row: {
          confidence_score: number | null
          created_at: string
          id: string
          metric_type: string
          metric_unit: string | null
          metric_value: number | null
          notes: string | null
          observed_at: string | null
          source_detail: string | null
          source_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          metric_type: string
          metric_unit?: string | null
          metric_value?: number | null
          notes?: string | null
          observed_at?: string | null
          source_detail?: string | null
          source_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          metric_type?: string
          metric_unit?: string | null
          metric_value?: number | null
          notes?: string | null
          observed_at?: string | null
          source_detail?: string | null
          source_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      athlete_profiles: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          gym_access: boolean | null
          height_cm: number | null
          home_trainer: boolean | null
          id: string
          notes: string | null
          onboarding_completed: boolean | null
          pool_access: boolean | null
          sex: string | null
          timezone: string | null
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          gym_access?: boolean | null
          height_cm?: number | null
          home_trainer?: boolean | null
          id?: string
          notes?: string | null
          onboarding_completed?: boolean | null
          pool_access?: boolean | null
          sex?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          gym_access?: boolean | null
          height_cm?: number | null
          home_trainer?: boolean | null
          id?: string
          notes?: string | null
          onboarding_completed?: boolean | null
          pool_access?: boolean | null
          sex?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      completed_workout_feedback: {
        Row: {
          comment_text: string | null
          completed_workout_id: string
          created_at: string
          fatigue_after: number | null
          id: string
          rpe: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_text?: string | null
          completed_workout_id: string
          created_at?: string
          fatigue_after?: number | null
          id?: string
          rpe?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_text?: string | null
          completed_workout_id?: string
          created_at?: string
          fatigue_after?: number | null
          id?: string
          rpe?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "completed_workout_feedback_completed_workout_id_fkey"
            columns: ["completed_workout_id"]
            isOneToOne: true
            referencedRelation: "completed_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      completed_workouts: {
        Row: {
          activity_name: string | null
          avg_heartrate: number | null
          avg_power: number | null
          avg_speed: number | null
          calories: number | null
          conformity_status: string | null
          created_at: string
          distance_meters: number | null
          duration_seconds: number | null
          elevation_gain_meters: number | null
          id: string
          imported_activity_id: string | null
          matching_status: string
          max_heartrate: number | null
          moving_time_seconds: number | null
          planned_workout_id: string | null
          requires_adjustment_review: boolean | null
          short_analysis: string | null
          sport_type: string
          start_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_name?: string | null
          avg_heartrate?: number | null
          avg_power?: number | null
          avg_speed?: number | null
          calories?: number | null
          conformity_status?: string | null
          created_at?: string
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain_meters?: number | null
          id?: string
          imported_activity_id?: string | null
          matching_status?: string
          max_heartrate?: number | null
          moving_time_seconds?: number | null
          planned_workout_id?: string | null
          requires_adjustment_review?: boolean | null
          short_analysis?: string | null
          sport_type: string
          start_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_name?: string | null
          avg_heartrate?: number | null
          avg_power?: number | null
          avg_speed?: number | null
          calories?: number | null
          conformity_status?: string | null
          created_at?: string
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain_meters?: number | null
          id?: string
          imported_activity_id?: string | null
          matching_status?: string
          max_heartrate?: number | null
          moving_time_seconds?: number | null
          planned_workout_id?: string | null
          requires_adjustment_review?: boolean | null
          short_analysis?: string | null
          sport_type?: string
          start_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "completed_workouts_imported_activity_id_fkey"
            columns: ["imported_activity_id"]
            isOneToOne: true
            referencedRelation: "imported_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completed_workouts_planned_workout_id_fkey"
            columns: ["planned_workout_id"]
            isOneToOne: false
            referencedRelation: "planned_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      default_availability_rules: {
        Row: {
          created_at: string
          day_of_week: number
          id: string
          is_available: boolean | null
          max_duration_minutes: number | null
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          id?: string
          is_available?: boolean | null
          max_duration_minutes?: number | null
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          id?: string
          is_available?: boolean | null
          max_duration_minutes?: number | null
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goal_trajectory_snapshots: {
        Row: {
          created_at: string
          discipline_breakdown: Json | null
          goal_id: string
          id: string
          plan_id: string | null
          raw_input: Json | null
          realism_score_percent: number
          suggests_plan_review: boolean | null
          summary_detailed: string | null
          summary_short: string | null
          supporting_points: Json | null
          trajectory_status: string
          trigger_event: string | null
          user_id: string
          weakening_points: Json | null
        }
        Insert: {
          created_at?: string
          discipline_breakdown?: Json | null
          goal_id: string
          id?: string
          plan_id?: string | null
          raw_input?: Json | null
          realism_score_percent?: number
          suggests_plan_review?: boolean | null
          summary_detailed?: string | null
          summary_short?: string | null
          supporting_points?: Json | null
          trajectory_status?: string
          trigger_event?: string | null
          user_id: string
          weakening_points?: Json | null
        }
        Update: {
          created_at?: string
          discipline_breakdown?: Json | null
          goal_id?: string
          id?: string
          plan_id?: string | null
          raw_input?: Json | null
          realism_score_percent?: number
          suggests_plan_review?: boolean | null
          summary_detailed?: string | null
          summary_short?: string | null
          supporting_points?: Json | null
          trajectory_status?: string
          trigger_event?: string | null
          user_id?: string
          weakening_points?: Json | null
        }
        Relationships: []
      }
      imported_activities: {
        Row: {
          avg_heartrate: number | null
          avg_power: number | null
          avg_speed: number | null
          calories: number | null
          created_at: string
          details_fetched_at: string | null
          distance_meters: number | null
          duration_seconds: number | null
          elevation_gain_meters: number | null
          id: string
          laps: Json | null
          max_heartrate: number | null
          max_power: number | null
          max_speed: number | null
          moving_time_seconds: number | null
          name: string | null
          raw_payload: Json | null
          splits_metric: Json | null
          sport_type_normalized: string | null
          sport_type_raw: string | null
          start_date: string | null
          strava_id: number
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_heartrate?: number | null
          avg_power?: number | null
          avg_speed?: number | null
          calories?: number | null
          created_at?: string
          details_fetched_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain_meters?: number | null
          id?: string
          laps?: Json | null
          max_heartrate?: number | null
          max_power?: number | null
          max_speed?: number | null
          moving_time_seconds?: number | null
          name?: string | null
          raw_payload?: Json | null
          splits_metric?: Json | null
          sport_type_normalized?: string | null
          sport_type_raw?: string | null
          start_date?: string | null
          strava_id: number
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_heartrate?: number | null
          avg_power?: number | null
          avg_speed?: number | null
          calories?: number | null
          created_at?: string
          details_fetched_at?: string | null
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain_meters?: number | null
          id?: string
          laps?: Json | null
          max_heartrate?: number | null
          max_power?: number | null
          max_speed?: number | null
          moving_time_seconds?: number | null
          name?: string | null
          raw_payload?: Json | null
          splits_metric?: Json | null
          sport_type_normalized?: string | null
          sport_type_raw?: string | null
          start_date?: string | null
          strava_id?: number
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      performance_insights: {
        Row: {
          created_at: string
          data_summary: Json | null
          generated_at: string
          id: string
          insights: Json
          period_days: number
          recommendations: Json
          user_id: string
          vigilance: Json
        }
        Insert: {
          created_at?: string
          data_summary?: Json | null
          generated_at?: string
          id?: string
          insights?: Json
          period_days: number
          recommendations?: Json
          user_id: string
          vigilance?: Json
        }
        Update: {
          created_at?: string
          data_summary?: Json | null
          generated_at?: string
          id?: string
          insights?: Json
          period_days?: number
          recommendations?: Json
          user_id?: string
          vigilance?: Json
        }
        Relationships: []
      }
      plan_adjustments: {
        Row: {
          adjustment_type: string
          applied_at: string
          constraint_id: string | null
          created_at: string
          detailed_summary: string | null
          id: string
          plan_id: string
          proposal_id: string | null
          reason_summary: string | null
          user_id: string
          week_id: string
        }
        Insert: {
          adjustment_type?: string
          applied_at?: string
          constraint_id?: string | null
          created_at?: string
          detailed_summary?: string | null
          id?: string
          plan_id: string
          proposal_id?: string | null
          reason_summary?: string | null
          user_id: string
          week_id: string
        }
        Update: {
          adjustment_type?: string
          applied_at?: string
          constraint_id?: string | null
          created_at?: string
          detailed_summary?: string | null
          id?: string
          plan_id?: string
          proposal_id?: string | null
          reason_summary?: string | null
          user_id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_adjustments_constraint_id_fkey"
            columns: ["constraint_id"]
            isOneToOne: false
            referencedRelation: "weekly_constraints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_adjustments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_adjustments_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "weekly_adjustment_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_adjustments_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "training_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_regenerations: {
        Row: {
          created_at: string
          generated_plan_id: string
          id: string
          reason: string | null
          restored_at: string | null
          source_plan_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          generated_plan_id: string
          id?: string
          reason?: string | null
          restored_at?: string | null
          source_plan_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          generated_plan_id?: string
          id?: string
          reason?: string | null
          restored_at?: string | null
          source_plan_id?: string
          user_id?: string
        }
        Relationships: []
      }
      planned_workout_versions: {
        Row: {
          adjustment_id: string | null
          change_reason: string | null
          created_at: string
          id: string
          snapshot: Json
          user_id: string
          version_number: number
          workout_id: string
        }
        Insert: {
          adjustment_id?: string | null
          change_reason?: string | null
          created_at?: string
          id?: string
          snapshot: Json
          user_id: string
          version_number?: number
          workout_id: string
        }
        Update: {
          adjustment_id?: string | null
          change_reason?: string | null
          created_at?: string
          id?: string
          snapshot?: Json
          user_id?: string
          version_number?: number
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_workout_versions_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "plan_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_workout_versions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "planned_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_workouts: {
        Row: {
          carb_before_g: number | null
          carb_during_g_per_hour: number | null
          carb_strategy_type: string | null
          carb_total_target_g: number | null
          coach_note_short: string | null
          cooldown_summary: string | null
          created_at: string
          created_by_type: string | null
          distance_target_km: number | null
          distance_target_meters: number | null
          duration_target_minutes: number | null
          gut_training_priority: string | null
          hydration_note: string | null
          id: string
          intensity_zone_label: string | null
          main_set_summary: string | null
          primary_target_type: string | null
          primary_target_value_text: string | null
          scheduled_date: string | null
          secondary_target_value_text: string | null
          session_goal: string | null
          sport_type: string
          status: string
          structure_text: string | null
          target_summary_label: string | null
          updated_at: string
          user_id: string
          warmup_summary: string | null
          week_id: string
          workout_priority: string
          workout_structure_json: Json | null
        }
        Insert: {
          carb_before_g?: number | null
          carb_during_g_per_hour?: number | null
          carb_strategy_type?: string | null
          carb_total_target_g?: number | null
          coach_note_short?: string | null
          cooldown_summary?: string | null
          created_at?: string
          created_by_type?: string | null
          distance_target_km?: number | null
          distance_target_meters?: number | null
          duration_target_minutes?: number | null
          gut_training_priority?: string | null
          hydration_note?: string | null
          id?: string
          intensity_zone_label?: string | null
          main_set_summary?: string | null
          primary_target_type?: string | null
          primary_target_value_text?: string | null
          scheduled_date?: string | null
          secondary_target_value_text?: string | null
          session_goal?: string | null
          sport_type: string
          status?: string
          structure_text?: string | null
          target_summary_label?: string | null
          updated_at?: string
          user_id: string
          warmup_summary?: string | null
          week_id: string
          workout_priority?: string
          workout_structure_json?: Json | null
        }
        Update: {
          carb_before_g?: number | null
          carb_during_g_per_hour?: number | null
          carb_strategy_type?: string | null
          carb_total_target_g?: number | null
          coach_note_short?: string | null
          cooldown_summary?: string | null
          created_at?: string
          created_by_type?: string | null
          distance_target_km?: number | null
          distance_target_meters?: number | null
          duration_target_minutes?: number | null
          gut_training_priority?: string | null
          hydration_note?: string | null
          id?: string
          intensity_zone_label?: string | null
          main_set_summary?: string | null
          primary_target_type?: string | null
          primary_target_value_text?: string | null
          scheduled_date?: string | null
          secondary_target_value_text?: string | null
          session_goal?: string | null
          sport_type?: string
          status?: string
          structure_text?: string | null
          target_summary_label?: string | null
          updated_at?: string
          user_id?: string
          warmup_summary?: string | null
          week_id?: string
          workout_priority?: string
          workout_structure_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "planned_workouts_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "training_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      race_goals: {
        Row: {
          created_at: string
          event_name: string | null
          format: string | null
          goal_type: string
          id: string
          is_competition: boolean | null
          location: string | null
          primary_objective: string | null
          secondary_objective: string | null
          target_date: string | null
          target_time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_name?: string | null
          format?: string | null
          goal_type: string
          id?: string
          is_competition?: boolean | null
          location?: string | null
          primary_objective?: string | null
          secondary_objective?: string | null
          target_date?: string | null
          target_time?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_name?: string | null
          format?: string | null
          goal_type?: string
          id?: string
          is_competition?: boolean | null
          location?: string | null
          primary_objective?: string | null
          secondary_objective?: string | null
          target_date?: string | null
          target_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      strava_connections: {
        Row: {
          access_token: string | null
          connected_at: string | null
          created_at: string
          id: string
          import_activity_count: number | null
          import_status: string | null
          last_import_at: string | null
          refresh_token: string | null
          strava_athlete_id: number | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          import_activity_count?: number | null
          import_status?: string | null
          last_import_at?: string | null
          refresh_token?: string | null
          strava_athlete_id?: number | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          import_activity_count?: number | null
          import_status?: string | null
          last_import_at?: string | null
          refresh_token?: string | null
          strava_athlete_id?: number | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      training_blocks: {
        Row: {
          block_order: number
          created_at: string
          end_date: string | null
          focus: string | null
          id: string
          name: string
          notes: string | null
          plan_id: string
          start_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          block_order?: number
          created_at?: string
          end_date?: string | null
          focus?: string | null
          id?: string
          name: string
          notes?: string | null
          plan_id: string
          start_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          block_order?: number
          created_at?: string
          end_date?: string | null
          focus?: string | null
          id?: string
          name?: string
          notes?: string | null
          plan_id?: string
          start_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_blocks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "training_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plans: {
        Row: {
          created_at: string
          end_date: string | null
          goal_id: string | null
          id: string
          name: string
          notes: string | null
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          goal_id?: string | null
          id?: string
          name: string
          notes?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          goal_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_plans_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "race_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      training_weeks: {
        Row: {
          block_id: string
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          start_date: string | null
          updated_at: string
          user_id: string
          week_number: number
          week_type: string
        }
        Insert: {
          block_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          start_date?: string | null
          updated_at?: string
          user_id: string
          week_number: number
          week_type?: string
        }
        Update: {
          block_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          start_date?: string | null
          updated_at?: string
          user_id?: string
          week_number?: number
          week_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_weeks_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "training_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_adjustment_proposals: {
        Row: {
          changes_summary: string | null
          constraint_id: string | null
          created_at: string
          detailed_explanation: string | null
          id: string
          original_workouts: Json
          proposed_workouts: Json
          protected_workouts: Json | null
          sacrificed_workouts: Json | null
          status: string
          updated_at: string
          user_id: string
          week_id: string
        }
        Insert: {
          changes_summary?: string | null
          constraint_id?: string | null
          created_at?: string
          detailed_explanation?: string | null
          id?: string
          original_workouts?: Json
          proposed_workouts?: Json
          protected_workouts?: Json | null
          sacrificed_workouts?: Json | null
          status?: string
          updated_at?: string
          user_id: string
          week_id: string
        }
        Update: {
          changes_summary?: string | null
          constraint_id?: string | null
          created_at?: string
          detailed_explanation?: string | null
          id?: string
          original_workouts?: Json
          proposed_workouts?: Json
          protected_workouts?: Json | null
          sacrificed_workouts?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_adjustment_proposals_constraint_id_fkey"
            columns: ["constraint_id"]
            isOneToOne: false
            referencedRelation: "weekly_constraints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_adjustment_proposals_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "training_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_constraints: {
        Row: {
          created_at: string
          explicit_requests: Json | null
          free_text: string | null
          id: string
          life_load: number | null
          max_duration_per_day: Json | null
          perceived_fatigue: number | null
          sport_preferences_per_day: Json | null
          status: string
          unavailable_days: Json | null
          updated_at: string
          user_id: string
          week_id: string
          weekend_constraint: string | null
        }
        Insert: {
          created_at?: string
          explicit_requests?: Json | null
          free_text?: string | null
          id?: string
          life_load?: number | null
          max_duration_per_day?: Json | null
          perceived_fatigue?: number | null
          sport_preferences_per_day?: Json | null
          status?: string
          unavailable_days?: Json | null
          updated_at?: string
          user_id: string
          week_id: string
          weekend_constraint?: string | null
        }
        Update: {
          created_at?: string
          explicit_requests?: Json | null
          free_text?: string | null
          id?: string
          life_load?: number | null
          max_duration_per_day?: Json | null
          perceived_fatigue?: number | null
          sport_preferences_per_day?: Json | null
          status?: string
          unavailable_days?: Json | null
          updated_at?: string
          user_id?: string
          week_id?: string
          weekend_constraint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_constraints_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "training_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_analyses: {
        Row: {
          actual_summary: string | null
          analysis_type: string
          comparison_text: string | null
          completed_workout_id: string
          conformity_status: string | null
          created_at: string
          id: string
          interpretation_text: string | null
          planned_summary: string | null
          requires_adjustment_review: boolean | null
          updated_at: string
          user_id: string
          vigilance_signals: Json | null
        }
        Insert: {
          actual_summary?: string | null
          analysis_type?: string
          comparison_text?: string | null
          completed_workout_id: string
          conformity_status?: string | null
          created_at?: string
          id?: string
          interpretation_text?: string | null
          planned_summary?: string | null
          requires_adjustment_review?: boolean | null
          updated_at?: string
          user_id: string
          vigilance_signals?: Json | null
        }
        Update: {
          actual_summary?: string | null
          analysis_type?: string
          comparison_text?: string | null
          completed_workout_id?: string
          conformity_status?: string | null
          created_at?: string
          id?: string
          interpretation_text?: string | null
          planned_summary?: string | null
          requires_adjustment_review?: boolean | null
          updated_at?: string
          user_id?: string
          vigilance_signals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_analyses_completed_workout_id_fkey"
            columns: ["completed_workout_id"]
            isOneToOne: false
            referencedRelation: "completed_workouts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
