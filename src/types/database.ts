import type { Tables } from '@/integrations/supabase/types';

export type AppRole = 'super_admin' | 'admin' | 'coach' | 'sales_executive' | 'closer';

// Use Supabase-generated types directly to avoid type mismatches
export type Profile = Tables<'profiles'>;
export type SalesExecutive = Tables<'sales_executives'>;
export type Workspace = Tables<'workspaces'>;
export type WorkspaceTemplate = Tables<'workspace_templates'>;
export type ProvisioningJob = Tables<'provisioning_jobs'>;
export type GeneratedArtifact = Tables<'generated_artifacts'>;
export type IntegrationConfig = Tables<'integration_configs'>;
export type IntegrationEvent = Tables<'integration_events'>;
export type EodSubmission = Tables<'eod_submissions'>;
export type AuditLog = Tables<'audit_logs'>;
export type Setting = Tables<'settings'>;

export interface SalesExecutiveWithWorkspace extends SalesExecutive {
  workspaces?: Workspace[];
  integration_configs?: IntegrationConfig[];
}
