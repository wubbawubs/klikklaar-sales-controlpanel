
-- Rename tables
ALTER TABLE IF EXISTS public.pipedrive_lead_assignments RENAME TO lead_assignments;
ALTER TABLE IF EXISTS public.pipedrive_activities RENAME TO crm_activities;

-- Drop pipedrive-specific columns from lead_assignments
ALTER TABLE public.lead_assignments
  DROP COLUMN IF EXISTS pipedrive_org_id,
  DROP COLUMN IF EXISTS pipedrive_person_id,
  DROP COLUMN IF EXISTS pipedrive_deal_id;

-- Drop pipedrive-specific columns from crm_activities
ALTER TABLE public.crm_activities
  DROP COLUMN IF EXISTS pipedrive_activity_id,
  DROP COLUMN IF EXISTS pipedrive_org_id,
  DROP COLUMN IF EXISTS pipedrive_person_id,
  DROP COLUMN IF EXISTS pipedrive_deal_id,
  DROP COLUMN IF EXISTS synced_to_pipedrive,
  DROP COLUMN IF EXISTS pipedrive_sync_error;

-- Drop pipedrive token/domain from organizations
ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS pipedrive_api_token,
  DROP COLUMN IF EXISTS pipedrive_company_domain;

-- Remove pipedrive integration_configs rows
DELETE FROM public.integration_configs WHERE provider ILIKE 'pipedrive%';
