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
      calls: {
        Row: {
          callback_date: string | null
          callback_time: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          lead_assignment_id: string | null
          notes: string | null
          org_name: string | null
          organization_id: string | null
          outcome: string
          sales_executive_id: string
          updated_at: string
        }
        Insert: {
          callback_date?: string | null
          callback_time?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lead_assignment_id?: string | null
          notes?: string | null
          org_name?: string | null
          organization_id?: string | null
          outcome?: string
          sales_executive_id: string
          updated_at?: string
        }
        Update: {
          callback_date?: string | null
          callback_time?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lead_assignment_id?: string | null
          notes?: string | null
          org_name?: string | null
          organization_id?: string | null
          outcome?: string
          sales_executive_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_lead_assignment_id_fkey"
            columns: ["lead_assignment_id"]
            isOneToOne: false
            referencedRelation: "lead_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_sales_executive_id_fkey"
            columns: ["sales_executive_id"]
            isOneToOne: false
            referencedRelation: "sales_executives"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_appointments: {
        Row: {
          calendly_event_uri: string | null
          calendly_invitee_uri: string | null
          caller_sales_executive_id: string | null
          closer_user_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          deal_value_eur: number | null
          id: string
          last_activity_at: string
          lead_assignment_id: string | null
          metadata_json: Json
          next_action_at: string | null
          notes: string | null
          org_name: string | null
          organization_id: string | null
          position: number
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          calendly_event_uri?: string | null
          calendly_invitee_uri?: string | null
          caller_sales_executive_id?: string | null
          closer_user_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deal_value_eur?: number | null
          id?: string
          last_activity_at?: string
          lead_assignment_id?: string | null
          metadata_json?: Json
          next_action_at?: string | null
          notes?: string | null
          org_name?: string | null
          organization_id?: string | null
          position?: number
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          calendly_event_uri?: string | null
          calendly_invitee_uri?: string | null
          caller_sales_executive_id?: string | null
          closer_user_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          deal_value_eur?: number | null
          id?: string
          last_activity_at?: string
          lead_assignment_id?: string | null
          metadata_json?: Json
          next_action_at?: string | null
          notes?: string | null
          org_name?: string | null
          organization_id?: string | null
          position?: number
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closer_appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      closer_round_robin_state: {
        Row: {
          id: number
          last_assigned_closer_user_id: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          last_assigned_closer_user_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          last_assigned_closer_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_activities: {
        Row: {
          activity_type: string
          created_at: string | null
          done: boolean | null
          due_date: string | null
          duration_minutes: number | null
          id: string
          lead_assignment_id: string | null
          note: string | null
          outcome: string | null
          sales_executive_id: string
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          activity_type?: string
          created_at?: string | null
          done?: boolean | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          lead_assignment_id?: string | null
          note?: string | null
          outcome?: string | null
          sales_executive_id: string
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          done?: boolean | null
          due_date?: string | null
          duration_minutes?: number | null
          id?: string
          lead_assignment_id?: string | null
          note?: string | null
          outcome?: string | null
          sales_executive_id?: string
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipedrive_activities_lead_assignment_id_fkey"
            columns: ["lead_assignment_id"]
            isOneToOne: false
            referencedRelation: "lead_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipedrive_activities_sales_executive_id_fkey"
            columns: ["sales_executive_id"]
            isOneToOne: false
            referencedRelation: "sales_executives"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      eod_submission_data: {
        Row: {
          appointments_set: number | null
          blocker_text: string | null
          calls_attempted: number | null
          coaching_text: string | null
          created_at: string | null
          day_score: number | null
          deals_closed: number | null
          employee_name: string | null
          energy_score: number | null
          extra_notes: string | null
          focus_tomorrow: string | null
          followups_set: number | null
          form_id: string
          good_things: string | null
          id: string
          metadata_json: Json | null
          product_lines: string[] | null
          real_conversations: number | null
          sales_executive_id: string | null
          submission_id: string
          team: string | null
          work_date: string | null
        }
        Insert: {
          appointments_set?: number | null
          blocker_text?: string | null
          calls_attempted?: number | null
          coaching_text?: string | null
          created_at?: string | null
          day_score?: number | null
          deals_closed?: number | null
          employee_name?: string | null
          energy_score?: number | null
          extra_notes?: string | null
          focus_tomorrow?: string | null
          followups_set?: number | null
          form_id: string
          good_things?: string | null
          id?: string
          metadata_json?: Json | null
          product_lines?: string[] | null
          real_conversations?: number | null
          sales_executive_id?: string | null
          submission_id: string
          team?: string | null
          work_date?: string | null
        }
        Update: {
          appointments_set?: number | null
          blocker_text?: string | null
          calls_attempted?: number | null
          coaching_text?: string | null
          created_at?: string | null
          day_score?: number | null
          deals_closed?: number | null
          employee_name?: string | null
          energy_score?: number | null
          extra_notes?: string | null
          focus_tomorrow?: string | null
          followups_set?: number | null
          form_id?: string
          good_things?: string | null
          id?: string
          metadata_json?: Json | null
          product_lines?: string[] | null
          real_conversations?: number | null
          sales_executive_id?: string | null
          submission_id?: string
          team?: string | null
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eod_submission_data_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_submission_data_sales_executive_id_fkey"
            columns: ["sales_executive_id"]
            isOneToOne: false
            referencedRelation: "sales_executives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_submission_data_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_submissions: {
        Row: {
          coach_notes: string | null
          created_at: string | null
          follow_up_required: boolean | null
          follow_up_status: string | null
          id: string
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
            foreignKeyName: "eod_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      form_questions: {
        Row: {
          created_at: string | null
          form_id: string
          id: string
          options_json: Json | null
          order_index: number
          question_text: string
          question_type: string
          required: boolean | null
          settings_json: Json | null
        }
        Insert: {
          created_at?: string | null
          form_id: string
          id?: string
          options_json?: Json | null
          order_index?: number
          question_text: string
          question_type: string
          required?: boolean | null
          settings_json?: Json | null
        }
        Update: {
          created_at?: string | null
          form_id?: string
          id?: string
          options_json?: Json | null
          order_index?: number
          question_text?: string
          question_type?: string
          required?: boolean | null
          settings_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_questions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          created_at: string | null
          form_id: string
          id: string
          metadata_json: Json | null
          submitted_at: string | null
        }
        Insert: {
          created_at?: string | null
          form_id: string
          id?: string
          metadata_json?: Json | null
          submitted_at?: string | null
        }
        Update: {
          created_at?: string | null
          form_id?: string
          id?: string
          metadata_json?: Json | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          settings_json: Json | null
          slug: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          settings_json?: Json | null
          slug: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          settings_json?: Json | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      funnel_events: {
        Row: {
          closer_appointment_id: string | null
          closer_user_id: string | null
          created_at: string
          event_at: string
          funnel_type: string
          id: string
          lead_assignment_id: string | null
          metadata_json: Json
          organization_id: string | null
          sales_executive_id: string | null
          source_id: string | null
          source_table: string
          stage: string
          value_eur: number | null
        }
        Insert: {
          closer_appointment_id?: string | null
          closer_user_id?: string | null
          created_at?: string
          event_at?: string
          funnel_type: string
          id?: string
          lead_assignment_id?: string | null
          metadata_json?: Json
          organization_id?: string | null
          sales_executive_id?: string | null
          source_id?: string | null
          source_table: string
          stage: string
          value_eur?: number | null
        }
        Update: {
          closer_appointment_id?: string | null
          closer_user_id?: string | null
          created_at?: string
          event_at?: string
          funnel_type?: string
          id?: string
          lead_assignment_id?: string | null
          metadata_json?: Json
          organization_id?: string | null
          sales_executive_id?: string | null
          source_id?: string | null
          source_table?: string
          stage?: string
          value_eur?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_targets: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          from_stage: string
          funnel_type: string
          id: string
          scope: string
          scope_user_id: string | null
          target_pct: number
          to_stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          from_stage: string
          funnel_type: string
          id?: string
          scope?: string
          scope_user_id?: string | null
          target_pct: number
          to_stage: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          from_stage?: string
          funnel_type?: string
          id?: string
          scope?: string
          scope_user_id?: string | null
          target_pct?: number
          to_stage?: string
          updated_at?: string
        }
        Relationships: []
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
      health_events: {
        Row: {
          check_type: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          notified: boolean
          sales_executive_id: string
          status: string
          suggested_fix: string | null
        }
        Insert: {
          check_type: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          notified?: boolean
          sales_executive_id: string
          status?: string
          suggested_fix?: string | null
        }
        Update: {
          check_type?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          notified?: boolean
          sales_executive_id?: string
          status?: string
          suggested_fix?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_events_sales_executive_id_fkey"
            columns: ["sales_executive_id"]
            isOneToOne: false
            referencedRelation: "sales_executives"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          provider?: string
          status?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      lead_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          branche: string | null
          created_at: string | null
          deal_title: string | null
          id: string
          notes: string | null
          org_name: string | null
          organization_id: string | null
          person_email: string | null
          person_name: string | null
          person_phone: string | null
          product_line: string | null
          sales_executive_id: string
          status: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          branche?: string | null
          created_at?: string | null
          deal_title?: string | null
          id?: string
          notes?: string | null
          org_name?: string | null
          organization_id?: string | null
          person_email?: string | null
          person_name?: string | null
          person_phone?: string | null
          product_line?: string | null
          sales_executive_id: string
          status?: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          branche?: string | null
          created_at?: string | null
          deal_title?: string | null
          id?: string
          notes?: string | null
          org_name?: string | null
          organization_id?: string | null
          person_email?: string | null
          person_name?: string | null
          person_phone?: string | null
          product_line?: string | null
          sales_executive_id?: string
          status?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipedrive_lead_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipedrive_lead_assignments_sales_executive_id_fkey"
            columns: ["sales_executive_id"]
            isOneToOne: false
            referencedRelation: "sales_executives"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_updates: {
        Row: {
          created_at: string
          data_json: Json | null
          id: string
          impact: string
          sales_executive_id: string | null
          scope: string
          title: string
          what_changed: string
          why: string
        }
        Insert: {
          created_at?: string
          data_json?: Json | null
          id?: string
          impact: string
          sales_executive_id?: string | null
          scope?: string
          title: string
          what_changed: string
          why: string
        }
        Update: {
          created_at?: string
          data_json?: Json | null
          id?: string
          impact?: string
          sales_executive_id?: string | null
          scope?: string
          title?: string
          what_changed?: string
          why?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_updates_sales_executive_id_fkey"
            columns: ["sales_executive_id"]
            isOneToOne: false
            referencedRelation: "sales_executives"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          email_enabled: boolean | null
          id: string
          push_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          push_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
          push_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          metadata_json: Json | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          metadata_json?: Json | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          metadata_json?: Json | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          accent_color_hex: string | null
          active: boolean
          created_at: string
          id: string
          logo_url: string | null
          modules: string[]
          name: string
          primary_color_hex: string | null
          slug: string
          subdomain: string | null
          updated_at: string
        }
        Insert: {
          accent_color_hex?: string | null
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          modules?: string[]
          name: string
          primary_color_hex?: string | null
          slug: string
          subdomain?: string | null
          updated_at?: string
        }
        Update: {
          accent_color_hex?: string | null
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          modules?: string[]
          name?: string
          primary_color_hex?: string | null
          slug?: string
          subdomain?: string | null
          updated_at?: string
        }
        Relationships: []
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
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string | null
          enabled: boolean | null
          endpoint: string
          id: string
          is_installed: boolean | null
          p256dh_key: string
          platform: string
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string | null
          enabled?: boolean | null
          endpoint: string
          id?: string
          is_installed?: boolean | null
          p256dh_key: string
          platform?: string
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string | null
          enabled?: boolean | null
          endpoint?: string
          id?: string
          is_installed?: boolean | null
          p256dh_key?: string
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
      sales_executives: {
        Row: {
          coach_user_id: string | null
          created_at: string | null
          created_by: string | null
          email: string
          employment_type: string
          external_access_required: boolean | null
          external_guest_email: string | null
          first_name: string
          full_name: string | null
          id: string
          last_name: string
          organization_id: string | null
          phone: string | null
          start_date: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          coach_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email: string
          employment_type?: string
          external_access_required?: boolean | null
          external_guest_email?: string | null
          first_name: string
          full_name?: string | null
          id?: string
          last_name: string
          organization_id?: string | null
          phone?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          coach_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          employment_type?: string
          external_access_required?: boolean | null
          external_guest_email?: string | null
          first_name?: string
          full_name?: string | null
          id?: string
          last_name?: string
          organization_id?: string | null
          phone?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_executives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      se_baselines: {
        Row: {
          baseline_value: number
          created_at: string
          data_json: Json | null
          id: string
          metric_name: string
          minimum_threshold: number | null
          period_end: string | null
          period_start: string | null
          sales_executive_id: string
          team_benchmark: number | null
          updated_at: string
        }
        Insert: {
          baseline_value?: number
          created_at?: string
          data_json?: Json | null
          id?: string
          metric_name: string
          minimum_threshold?: number | null
          period_end?: string | null
          period_start?: string | null
          sales_executive_id: string
          team_benchmark?: number | null
          updated_at?: string
        }
        Update: {
          baseline_value?: number
          created_at?: string
          data_json?: Json | null
          id?: string
          metric_name?: string
          minimum_threshold?: number | null
          period_end?: string | null
          period_start?: string | null
          sales_executive_id?: string
          team_benchmark?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "se_baselines_sales_executive_id_fkey"
            columns: ["sales_executive_id"]
            isOneToOne: false
            referencedRelation: "sales_executives"
            referencedColumns: ["id"]
          },
        ]
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
      signals: {
        Row: {
          action: string | null
          confidence: string | null
          created_at: string
          data_json: Json | null
          description: string | null
          escalation_level: number | null
          id: string
          organization_id: string | null
          resolved: boolean | null
          resolved_at: string | null
          sales_executive_id: string
          severity: string
          signal_type: string
          title: string
        }
        Insert: {
          action?: string | null
          confidence?: string | null
          created_at?: string
          data_json?: Json | null
          description?: string | null
          escalation_level?: number | null
          id?: string
          organization_id?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          sales_executive_id: string
          severity?: string
          signal_type: string
          title: string
        }
        Update: {
          action?: string | null
          confidence?: string | null
          created_at?: string
          data_json?: Json | null
          description?: string | null
          escalation_level?: number | null
          id?: string
          organization_id?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          sales_executive_id?: string
          severity?: string
          signal_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_sales_executive_id_fkey"
            columns: ["sales_executive_id"]
            isOneToOne: false
            referencedRelation: "sales_executives"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_answers: {
        Row: {
          answer_json: Json | null
          answer_text: string | null
          id: string
          question_id: string
          submission_id: string
        }
        Insert: {
          answer_json?: Json | null
          answer_text?: string | null
          id?: string
          question_id: string
          submission_id: string
        }
        Update: {
          answer_json?: Json | null
          answer_text?: string | null
          id?: string
          question_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "form_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_insights: {
        Row: {
          active: boolean | null
          created_at: string
          data_json: Json | null
          description: string
          id: string
          insight_type: string
          segment: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          data_json?: Json | null
          description: string
          id?: string
          insight_type: string
          segment?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          data_json?: Json | null
          description?: string
          id?: string
          insight_type?: string
          segment?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_documents: {
        Row: {
          category: string
          created_at: string
          display_name: string
          file_name: string
          file_path: string
          file_size_bytes: number | null
          id: string
        }
        Insert: {
          category: string
          created_at?: string
          display_name: string
          file_name: string
          file_path: string
          file_size_bytes?: number | null
          id?: string
        }
        Update: {
          category?: string
          created_at?: string
          display_name?: string
          file_name?: string
          file_path?: string
          file_size_bytes?: number | null
          id?: string
        }
        Relationships: []
      }
      user_organizations: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          selected_form_ids: string[] | null
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
          selected_form_ids?: string[] | null
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
          selected_form_ids?: string[] | null
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
      check_missed_eod: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "coach" | "sales_executive" | "closer"
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
      app_role: ["super_admin", "admin", "coach", "sales_executive", "closer"],
    },
  },
} as const
