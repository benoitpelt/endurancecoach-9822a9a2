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
      imported_activities: {
        Row: {
          avg_heartrate: number | null
          avg_power: number | null
          avg_speed: number | null
          calories: number | null
          created_at: string
          distance_meters: number | null
          duration_seconds: number | null
          elevation_gain_meters: number | null
          id: string
          max_heartrate: number | null
          max_power: number | null
          max_speed: number | null
          moving_time_seconds: number | null
          name: string | null
          raw_payload: Json | null
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
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain_meters?: number | null
          id?: string
          max_heartrate?: number | null
          max_power?: number | null
          max_speed?: number | null
          moving_time_seconds?: number | null
          name?: string | null
          raw_payload?: Json | null
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
          distance_meters?: number | null
          duration_seconds?: number | null
          elevation_gain_meters?: number | null
          id?: string
          max_heartrate?: number | null
          max_power?: number | null
          max_speed?: number | null
          moving_time_seconds?: number | null
          name?: string | null
          raw_payload?: Json | null
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
      planned_workouts: {
        Row: {
          carb_before_g: number | null
          carb_during_g_per_hour: number | null
          carb_strategy_type: string | null
          carb_total_target_g: number | null
          coach_note_short: string | null
          created_at: string
          created_by_type: string | null
          distance_target_km: number | null
          duration_target_minutes: number | null
          gut_training_priority: string | null
          hydration_note: string | null
          id: string
          intensity_zone_label: string | null
          scheduled_date: string | null
          session_goal: string | null
          sport_type: string
          status: string
          structure_text: string | null
          updated_at: string
          user_id: string
          week_id: string
          workout_priority: string
        }
        Insert: {
          carb_before_g?: number | null
          carb_during_g_per_hour?: number | null
          carb_strategy_type?: string | null
          carb_total_target_g?: number | null
          coach_note_short?: string | null
          created_at?: string
          created_by_type?: string | null
          distance_target_km?: number | null
          duration_target_minutes?: number | null
          gut_training_priority?: string | null
          hydration_note?: string | null
          id?: string
          intensity_zone_label?: string | null
          scheduled_date?: string | null
          session_goal?: string | null
          sport_type: string
          status?: string
          structure_text?: string | null
          updated_at?: string
          user_id: string
          week_id: string
          workout_priority?: string
        }
        Update: {
          carb_before_g?: number | null
          carb_during_g_per_hour?: number | null
          carb_strategy_type?: string | null
          carb_total_target_g?: number | null
          coach_note_short?: string | null
          created_at?: string
          created_by_type?: string | null
          distance_target_km?: number | null
          duration_target_minutes?: number | null
          gut_training_priority?: string | null
          hydration_note?: string | null
          id?: string
          intensity_zone_label?: string | null
          scheduled_date?: string | null
          session_goal?: string | null
          sport_type?: string
          status?: string
          structure_text?: string | null
          updated_at?: string
          user_id?: string
          week_id?: string
          workout_priority?: string
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
