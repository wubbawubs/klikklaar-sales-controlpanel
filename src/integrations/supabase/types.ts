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
      audit_logs: {
        Row: {
          action_type: string
          actor_user_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action_type: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action_type?: string
          actor_user_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      eod_submissions: {
        Row: {
          coach_notes: string | null
          created_at: string | null
          follow_up_required: boolean | null
          follow_up_status: string | null
          id: string
          sales_executive_id: string
          session_date: string
          status: string | null
          submitted_at: string | null
          summary_json: Json | null
          typeform_response_id: string | null
          workspace_id: string
        }
        Insert: {
          coach_notes?: string | null
          created_at?: string | null
          follow_up_required?: boolean | null
          follow_up_status?: string | null
          id?: string
          sales_executive_id: string
          session_date: string
          status?: string | null
          submitted_at?: string | null
          summary_json?: Json | null
          typeform_response_id?: string | null
          workspace_id: string
        }
        Update: {
          coach_notes?: string | null
          created_at?: string | null
          follow_up_required?: boolean | null
          follow_up_status?: string | null
          id?: string
          sales_executive_id?: string
          session_date?: string
          status?: string | null
          submitted_at?: string | null
          summary_json?: Json | null
          typeform_response_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eod_submissions_sales_executive_id_fkey"
            columns: ["sales_executive_id"]
            isOneToOne: false
            referencedRelation: "sales_executives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_submissions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_artifacts: {
        Row: {
          artifact_content: Json | null
          artifact_format: string | null
          artifact_name: string
          artifact_text: string | null
          artifact_type: string
          created_at: string | null
          editable: boolean | null
          id: string
          version: string | null
          workspace_id: string
        }
        Insert: {
          artifact_content?: Json | null
          artifact_format?: string | null
          artifact_name: string
          artifact_text?: string | null
          artifact_type: string
          created_at?: string | null
          editable?: boolean | null
          id?: string
          version?: string | null
          workspace_id: string
        }
        Update: {
          artifact_content?: Json | null
          artifact_format?: string | null
          artifact_name?: string
          artifact_text?: string | null
          artifact_type?: string
          created_at?: string | null
          editable?: boolean | null
          id?: string
          version?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_artifacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_configs: {
        Row: {
          auth_type: string | null
          config_json: Json | null
          created_at: string | null
          enabled: boolean | null
          id: string
          last_tested_at: string | null
          notes: string | null
          provider: string
          status: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          auth_type?: string | null
          config_json?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_tested_at?: string | null
          notes?: string | null
          provider: string
          status?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          auth_type?: string | null
          config_json?: Json | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          last_tested_at?: string | null
          notes?: string | null
          provider?: string
          status?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          last_error: string | null
          payload_json: Json | null
          processed_at: string | null
          processing_status: string | null
          retry_count: number | null
          source_system: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          last_error?: string | null
          payload_json?: Json | null
          processed_at?: string | null
          processing_status?: string | null
          retry_count?: number | null
          source_system: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          last_error?: string | null
          payload_json?: Json | null
          processed_at?: string | null
          processing_status?: string | null
          retry_count?: number | null
          source_system?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      provisioning_jobs: {
        Row: {
          artifact_version: string | null
          created_at: string | null
          execution_log: Json | null
          finished_at: string | null
          id: string
          job_type: string
          manual_actions_required: string[] | null
          started_at: string | null
          status: string | null
          workspace_id: string
        }
        Insert: {
          artifact_version?: string | null
          created_at?: string | null
          execution_log?: Json | null
          finished_at?: string | null
          id?: string
          job_type: string
          manual_actions_required?: string[] | null
          started_at?: string | null
          status?: string | null
          workspace_id: string
        }
        Update: {
          artifact_version?: string | null
          created_at?: string | null
          execution_log?: Json | null
          finished_at?: string | null
          id?: string
          job_type?: string
          manual_actions_required?: string[] | null
          started_at?: string | null
          status?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_executives: {
        Row: {
          coach_user_id: string | null
          created_at: string | null
          created_by: string | null
          email: string
          external_access_required: boolean | null
          external_guest_email: string | null
          first_name: string
          full_name: string | null
          id: string
          last_name: string
          phone: string | null
          start_date: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          coach_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email: string
          external_access_required?: boolean | null
          external_guest_email?: string | null
          first_name: string
          full_name?: string | null
          id?: string
          last_name: string
          phone?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          coach_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          external_access_required?: boolean | null
          external_guest_email?: string | null
          first_name?: string
          full_name?: string | null
          id?: string
          last_name?: string
          phone?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value_json: Json | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value_json?: Json | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value_json?: Json | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          integration_template_json: Json | null
          is_default: boolean | null
          power_automate_template_json: Json | null
          sharepoint_template_json: Json | null
          template_name: string
          version: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          integration_template_json?: Json | null
          is_default?: boolean | null
          power_automate_template_json?: Json | null
          sharepoint_template_json?: Json | null
          template_name: string
          version?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          integration_template_json?: Json | null
          is_default?: boolean | null
          power_automate_template_json?: Json | null
          sharepoint_template_json?: Json | null
          template_name?: string
          version?: string | null
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          account_management_enabled: boolean | null
          active: boolean | null
          appointment_scheduling_enabled: boolean | null
          created_at: string | null
          deal_registration_enabled: boolean | null
          eod_display_mode: string | null
          eod_typeform_url: string | null
          id: string
          include_excel_import: boolean | null
          include_lead_list: boolean | null
          include_training_library: boolean | null
          permission_status: string | null
          product_lines: string[] | null
          provisioning_mode: string | null
          sales_executive_id: string
          sharepoint_site_name: string | null
          sharepoint_site_url: string | null
          sharepoint_status: string | null
          updated_at: string | null
          workspace_name: string
          workspace_slug: string | null
        }
        Insert: {
          account_management_enabled?: boolean | null
          active?: boolean | null
          appointment_scheduling_enabled?: boolean | null
          created_at?: string | null
          deal_registration_enabled?: boolean | null
          eod_display_mode?: string | null
          eod_typeform_url?: string | null
          id?: string
          include_excel_import?: boolean | null
          include_lead_list?: boolean | null
          include_training_library?: boolean | null
          permission_status?: string | null
          product_lines?: string[] | null
          provisioning_mode?: string | null
          sales_executive_id: string
          sharepoint_site_name?: string | null
          sharepoint_site_url?: string | null
          sharepoint_status?: string | null
          updated_at?: string | null
          workspace_name: string
          workspace_slug?: string | null
        }
        Update: {
          account_management_enabled?: boolean | null
          active?: boolean | null
          appointment_scheduling_enabled?: boolean | null
          created_at?: string | null
          deal_registration_enabled?: boolean | null
          eod_display_mode?: string | null
          eod_typeform_url?: string | null
          id?: string
          include_excel_import?: boolean | null
          include_lead_list?: boolean | null
          include_training_library?: boolean | null
          permission_status?: string | null
          product_lines?: string[] | null
          provisioning_mode?: string | null
          sales_executive_id?: string
          sharepoint_site_name?: string | null
          sharepoint_site_url?: string | null
          sharepoint_status?: string | null
          updated_at?: string | null
          workspace_name?: string
          workspace_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_sales_executive_id_fkey"
            columns: ["sales_executive_id"]
            isOneToOne: false
            referencedRelation: "sales_executives"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "coach" | "sales_executive"
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
    Enums: {
      app_role: ["super_admin", "admin", "coach", "sales_executive"],
    },
  },
} as const
