export type AppRole = 'super_admin' | 'admin' | 'coach' | 'sales_executive';

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalesExecutive {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string | null;
  start_date: string | null;
  external_guest_email: string | null;
  external_access_required: boolean;
  status: 'active' | 'inactive' | 'onboarding' | 'offboarded';
  coach_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  sales_executive_id: string;
  workspace_name: string;
  workspace_slug: string | null;
  sharepoint_site_name: string | null;
  sharepoint_site_url: string | null;
  sharepoint_status: 'draft' | 'configured' | 'artifacts_generated' | 'ready' | 'executed' | 'failed' | 'manual_action_required';
  provisioning_mode: 'design_only' | 'export_package' | 'controlled_execution';
  permission_status: string;
  eod_typeform_url: string | null;
  eod_display_mode: 'embedded' | 'external_link';
  include_training_library: boolean;
  include_lead_list: boolean;
  include_excel_import: boolean;
  product_lines: string[];
  deal_registration_enabled: boolean;
  appointment_scheduling_enabled: boolean;
  account_management_enabled: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceTemplate {
  id: string;
  template_name: string;
  version: string;
  description: string | null;
  is_default: boolean;
  sharepoint_template_json: Record<string, unknown>;
  power_automate_template_json: Record<string, unknown>;
  integration_template_json: Record<string, unknown>;
  created_at: string;
}

export interface ProvisioningJob {
  id: string;
  workspace_id: string;
  job_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'manual_action_required';
  started_at: string | null;
  finished_at: string | null;
  execution_log: unknown[];
  manual_actions_required: string[] | null;
  artifact_version: string | null;
  created_at: string;
}

export interface GeneratedArtifact {
  id: string;
  workspace_id: string;
  artifact_type: string;
  artifact_name: string;
  artifact_format: string;
  artifact_content: Record<string, unknown> | null;
  artifact_text: string | null;
  version: string;
  editable: boolean;
  created_at: string;
}

export interface IntegrationConfig {
  id: string;
  workspace_id: string;
  provider: 'pipedrive' | 'exact' | 'qapitaal' | 'typeform';
  enabled: boolean;
  auth_type: string;
  config_json: Record<string, unknown>;
  status: 'not_configured' | 'ready_for_test' | 'connected' | 'error' | 'manual_action_required';
  last_tested_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationEvent {
  id: string;
  workspace_id: string | null;
  source_system: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  payload_json: Record<string, unknown> | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed' | 'retry';
  retry_count: number;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface EodSubmission {
  id: string;
  workspace_id: string;
  sales_executive_id: string;
  session_date: string;
  typeform_response_id: string | null;
  submitted_at: string | null;
  status: 'pending' | 'submitted' | 'reviewed' | 'follow_up_required';
  summary_json: Record<string, unknown> | null;
  follow_up_required: boolean;
  follow_up_status: 'none' | 'pending' | 'in_progress' | 'completed';
  coach_notes: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
}

export interface Setting {
  id: string;
  key: string;
  value_json: unknown;
  updated_at: string;
}

export interface SalesExecutiveWithWorkspace extends SalesExecutive {
  workspaces?: Workspace[];
  integration_configs?: IntegrationConfig[];
}
