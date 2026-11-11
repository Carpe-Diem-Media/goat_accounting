export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  estimator: {
    Tables: {
      estimate_line_items: {
        Row: {
          branch: Database["estimator"]["Enums"]["estimate_branch"]
          category: Database["estimator"]["Enums"]["estimate_line_item_category"]
          estimate_id: string
          explanation: string
          id: string
          item_code: string
          label: string
          max_cents: number
          min_cents: number
          pricing_rule_id: string
          quantity: number | null
          rule_code: string
          sort_order: number
          unit: string | null
        }
        Insert: {
          branch: Database["estimator"]["Enums"]["estimate_branch"]
          category: Database["estimator"]["Enums"]["estimate_line_item_category"]
          estimate_id: string
          explanation: string
          id?: string
          item_code: string
          label: string
          max_cents: number
          min_cents: number
          pricing_rule_id: string
          quantity?: number | null
          rule_code: string
          sort_order?: number
          unit?: string | null
        }
        Update: {
          branch?: Database["estimator"]["Enums"]["estimate_branch"]
          category?: Database["estimator"]["Enums"]["estimate_line_item_category"]
          estimate_id?: string
          explanation?: string
          id?: string
          item_code?: string
          label?: string
          max_cents?: number
          min_cents?: number
          pricing_rule_id?: string
          quantity?: number | null
          rule_code?: string
          sort_order?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimate_line_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_pricing_rule_id_fkey"
            columns: ["pricing_rule_id"]
            isOneToOne: false
            referencedRelation: "pricing_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          answers_snapshot: Json
          calculation_snapshot: Json
          calculator_type: Database["estimator"]["Enums"]["calculator_type"]
          catchup_max_cents: number
          catchup_min_cents: number
          confidence: Database["estimator"]["Enums"]["confidence_level"]
          created_at: string
          engine_version: string
          free_text: string | null
          id: string
          idempotency_key_hash: string | null
          manual_review_required: boolean
          ongoing_max_cents: number
          ongoing_min_cents: number
          pricing_model_id: string
          pricing_model_version: string
          public_ref: string
          request_fingerprint_hash: string | null
          review_flag_codes: string[]
          review_reasons: Json
          state: Database["estimator"]["Enums"]["estimate_state"]
          superseded_by_estimate_id: string | null
          supersedes_estimate_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          answers_snapshot: Json
          calculation_snapshot: Json
          calculator_type: Database["estimator"]["Enums"]["calculator_type"]
          catchup_max_cents?: number
          catchup_min_cents?: number
          confidence: Database["estimator"]["Enums"]["confidence_level"]
          created_at?: string
          engine_version: string
          free_text?: string | null
          id?: string
          idempotency_key_hash?: string | null
          manual_review_required: boolean
          ongoing_max_cents?: number
          ongoing_min_cents?: number
          pricing_model_id: string
          pricing_model_version: string
          public_ref?: string
          request_fingerprint_hash?: string | null
          review_flag_codes?: string[]
          review_reasons?: Json
          state?: Database["estimator"]["Enums"]["estimate_state"]
          superseded_by_estimate_id?: string | null
          supersedes_estimate_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          answers_snapshot?: Json
          calculation_snapshot?: Json
          calculator_type?: Database["estimator"]["Enums"]["calculator_type"]
          catchup_max_cents?: number
          catchup_min_cents?: number
          confidence?: Database["estimator"]["Enums"]["confidence_level"]
          created_at?: string
          engine_version?: string
          free_text?: string | null
          id?: string
          idempotency_key_hash?: string | null
          manual_review_required?: boolean
          ongoing_max_cents?: number
          ongoing_min_cents?: number
          pricing_model_id?: string
          pricing_model_version?: string
          public_ref?: string
          request_fingerprint_hash?: string | null
          review_flag_codes?: string[]
          review_reasons?: Json
          state?: Database["estimator"]["Enums"]["estimate_state"]
          superseded_by_estimate_id?: string | null
          supersedes_estimate_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_pricing_model_version_fk"
            columns: ["pricing_model_id", "pricing_model_version"]
            isOneToOne: false
            referencedRelation: "pricing_models"
            referencedColumns: ["id", "version"]
          },
          {
            foreignKeyName: "estimates_superseded_by_estimate_id_fkey"
            columns: ["superseded_by_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_supersedes_estimate_id_fkey"
            columns: ["supersedes_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_order: number | null
          from_state: Database["estimator"]["Enums"]["lead_state"] | null
          id: string
          lead_id: string
          note: string | null
          reason_code: string | null
          to_state: Database["estimator"]["Enums"]["lead_state"]
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_order?: number | null
          from_state?: Database["estimator"]["Enums"]["lead_state"] | null
          id?: string
          lead_id: string
          note?: string | null
          reason_code?: string | null
          to_state: Database["estimator"]["Enums"]["lead_state"]
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_order?: number | null
          from_state?: Database["estimator"]["Enums"]["lead_state"] | null
          id?: string
          lead_id?: string
          note?: string | null
          reason_code?: string | null
          to_state?: Database["estimator"]["Enums"]["lead_state"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          business_name: string | null
          contact_consent_at: string
          created_at: string
          email: string
          estimate_id: string
          full_name: string
          id: string
          phone: string | null
          preferred_contact_method: string | null
          requested_contact: boolean | null
          requested_estimate_email: boolean | null
          state: Database["estimator"]["Enums"]["lead_state"]
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          contact_consent_at: string
          created_at?: string
          email: string
          estimate_id: string
          full_name: string
          id?: string
          phone?: string | null
          preferred_contact_method?: string | null
          requested_contact?: boolean | null
          requested_estimate_email?: boolean | null
          state?: Database["estimator"]["Enums"]["lead_state"]
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          contact_consent_at?: string
          created_at?: string
          email?: string
          estimate_id?: string
          full_name?: string
          id?: string
          phone?: string | null
          preferred_contact_method?: string | null
          requested_contact?: boolean | null
          requested_estimate_email?: boolean | null
          state?: Database["estimator"]["Enums"]["lead_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: true
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          estimate_id: string | null
          id: string
          last_attempt_at: string | null
          last_error_code: string | null
          last_error_safe_message: string | null
          lead_id: string | null
          provider: Database["estimator"]["Enums"]["notification_provider"]
          provider_message_id: string | null
          recipient_hash: string | null
          recipient_masked: string | null
          sent_at: string | null
          state: Database["estimator"]["Enums"]["notification_state"]
          type: Database["estimator"]["Enums"]["notification_type"]
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          estimate_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_error_safe_message?: string | null
          lead_id?: string | null
          provider?: Database["estimator"]["Enums"]["notification_provider"]
          provider_message_id?: string | null
          recipient_hash?: string | null
          recipient_masked?: string | null
          sent_at?: string | null
          state?: Database["estimator"]["Enums"]["notification_state"]
          type: Database["estimator"]["Enums"]["notification_type"]
        }
        Update: {
          attempt_count?: number
          created_at?: string
          estimate_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_error_safe_message?: string | null
          lead_id?: string | null
          provider?: Database["estimator"]["Enums"]["notification_provider"]
          provider_message_id?: string | null
          recipient_hash?: string | null
          recipient_masked?: string | null
          sent_at?: string | null
          state?: Database["estimator"]["Enums"]["notification_state"]
          type?: Database["estimator"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_models: {
        Row: {
          draft_revision: number
          activated_at: string | null
          activated_by: string | null
          checksum: string | null
          confidence_good_max_points: number
          confidence_high_max_points: number
          created_at: string
          created_by: string
          currency: string
          engine_contract_version: string
          id: string
          name: string
          notes: string | null
          retired_at: string | null
          retired_by: string | null
          state: Database["estimator"]["Enums"]["pricing_model_state"]
          version: string
        }
        Insert: {
          draft_revision?: number
          activated_at?: string | null
          activated_by?: string | null
          checksum?: string | null
          confidence_good_max_points: number
          confidence_high_max_points: number
          created_at?: string
          created_by: string
          currency?: string
          engine_contract_version: string
          id?: string
          name: string
          notes?: string | null
          retired_at?: string | null
          retired_by?: string | null
          state?: Database["estimator"]["Enums"]["pricing_model_state"]
          version: string
        }
        Update: {
          draft_revision?: number
          activated_at?: string | null
          activated_by?: string | null
          checksum?: string | null
          confidence_good_max_points?: number
          confidence_high_max_points?: number
          created_at?: string
          created_by?: string
          currency?: string
          engine_contract_version?: string
          id?: string
          name?: string
          notes?: string | null
          retired_at?: string | null
          retired_by?: string | null
          state?: Database["estimator"]["Enums"]["pricing_model_state"]
          version?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          category: Database["estimator"]["Enums"]["pricing_rule_category"]
          code: string
          conditions: Json
          created_at: string
          enabled: boolean
          explanation: string
          id: string
          input_key: string | null
          label: string
          parameters: Json
          pricing_model_id: string
          rule_type: Database["estimator"]["Enums"]["pricing_rule_type"]
          scope: Database["estimator"]["Enums"]["pricing_rule_scope"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: Database["estimator"]["Enums"]["pricing_rule_category"]
          code: string
          conditions?: Json
          created_at?: string
          enabled?: boolean
          explanation: string
          id?: string
          input_key?: string | null
          label: string
          parameters: Json
          pricing_model_id: string
          rule_type: Database["estimator"]["Enums"]["pricing_rule_type"]
          scope: Database["estimator"]["Enums"]["pricing_rule_scope"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: Database["estimator"]["Enums"]["pricing_rule_category"]
          code?: string
          conditions?: Json
          created_at?: string
          enabled?: boolean
          explanation?: string
          id?: string
          input_key?: string | null
          label?: string
          parameters?: Json
          pricing_model_id?: string
          rule_type?: Database["estimator"]["Enums"]["pricing_rule_type"]
          scope?: Database["estimator"]["Enums"]["pricing_rule_scope"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_pricing_model_id_fkey"
            columns: ["pricing_model_id"]
            isOneToOne: false
            referencedRelation: "pricing_models"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_users: {
        Row: {
          created_at: string
          role: Database["estimator"]["Enums"]["staff_role"]
          state: Database["estimator"]["Enums"]["staff_state"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["estimator"]["Enums"]["staff_role"]
          state?: Database["estimator"]["Enums"]["staff_state"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["estimator"]["Enums"]["staff_role"]
          state?: Database["estimator"]["Enums"]["staff_state"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dashboard_metrics: {
        Args: { p_start: string; p_end: string }
        Returns: Json
      }
      save_pricing_draft: {
        Args: { p_model_id: string; p_actor_user_id: string; p_expected_revision: number; p_high_max_points: number; p_good_max_points: number; p_rules: Json }
        Returns: number
      }
      clone_pricing_model: {
        Args: { p_source_id: string; p_version: string; p_actor_user_id: string }
        Returns: string
      }
      activate_pricing_model: {
        Args: {
          p_actor_user_id: string
          p_model_id: string
          p_validated_model: Json
        }
        Returns: undefined
      }
      create_contact_lead: {
        Args: {
          p_business_name: string | null
          p_contact_consent: boolean
          p_email: string
          p_estimate_id: string
          p_full_name: string
          p_phone: string | null
          p_preferred_contact_method: string
          p_requested_contact: boolean
          p_requested_estimate_email: boolean
        }
        Returns: string
      }
      is_current_staff: {
        Args: {
          p_require_aal2?: boolean
          p_roles: Database["estimator"]["Enums"]["staff_role"][]
        }
        Returns: boolean
      }
      pricing_model_activation_projection: {
        Args: { p_model_id: string }
        Returns: Json
      }
      pricing_model_definition_checksum: {
        Args: { p_model_id: string }
        Returns: string
      }
      transition_lead: {
        Args: {
          p_actor_user_id: string
          p_expected_state: Database["estimator"]["Enums"]["lead_state"]
          p_lead_id: string
          p_note?: string
          p_reason_code?: string
          p_to_state: Database["estimator"]["Enums"]["lead_state"]
        }
        Returns: undefined
      }
    }
    Enums: {
      calculator_type: "business" | "personal" | "both"
      confidence_level: "high" | "good" | "preliminary"
      estimate_branch: "business" | "personal"
      estimate_line_item_category: "catchup" | "ongoing"
      estimate_state: "VALID" | "SUPERSEDED" | "VOIDED"
      lead_state:
        | "NEW"
        | "CONTACTED"
        | "QUALIFIED"
        | "PROPOSAL_SENT"
        | "CLOSED_WON"
        | "CLOSED_LOST"
        | "CLOSED_NOT_A_FIT"
      notification_provider: "resend"
      notification_state: "PENDING" | "SENT" | "FAILED_RETRYABLE" | "EXHAUSTED"
      notification_type: "internal_lead" | "customer_estimate"
      pricing_model_state: "DRAFT" | "ACTIVE" | "RETIRED"
      pricing_rule_category: "catchup" | "ongoing" | "score" | "review"
      pricing_rule_scope: "business" | "personal" | "shared"
      pricing_rule_type:
        | "FIXED_RANGE"
        | "BAND_RANGE"
        | "PER_UNIT_RANGE"
        | "PER_PERIOD_RANGE"
        | "SERVICE_ADDON_RANGE"
        | "COMPLEXITY_SCORE"
        | "CONFIDENCE_WEIGHT"
        | "REVIEW_TRIGGER"
      staff_role: "admin" | "advisor" | "viewer"
      staff_state: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED"
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
  estimator: {
    Enums: {
      calculator_type: ["business", "personal", "both"],
      confidence_level: ["high", "good", "preliminary"],
      estimate_branch: ["business", "personal"],
      estimate_line_item_category: ["catchup", "ongoing"],
      estimate_state: ["VALID", "SUPERSEDED", "VOIDED"],
      lead_state: [
        "NEW",
        "CONTACTED",
        "QUALIFIED",
        "PROPOSAL_SENT",
        "CLOSED_WON",
        "CLOSED_LOST",
        "CLOSED_NOT_A_FIT",
      ],
      notification_provider: ["resend"],
      notification_state: ["PENDING", "SENT", "FAILED_RETRYABLE", "EXHAUSTED"],
      notification_type: ["internal_lead", "customer_estimate"],
      pricing_model_state: ["DRAFT", "ACTIVE", "RETIRED"],
      pricing_rule_category: ["catchup", "ongoing", "score", "review"],
      pricing_rule_scope: ["business", "personal", "shared"],
      pricing_rule_type: [
        "FIXED_RANGE",
        "BAND_RANGE",
        "PER_UNIT_RANGE",
        "PER_PERIOD_RANGE",
        "SERVICE_ADDON_RANGE",
        "COMPLEXITY_SCORE",
        "CONFIDENCE_WEIGHT",
        "REVIEW_TRIGGER",
      ],
      staff_role: ["admin", "advisor", "viewer"],
      staff_state: ["INVITED", "ACTIVE", "SUSPENDED", "DEACTIVATED"],
    },
  },
} as const
