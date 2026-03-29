-- Add unique constraints for upsert operations in pipedrive-sync
CREATE UNIQUE INDEX IF NOT EXISTS idx_pla_se_deal ON public.pipedrive_lead_assignments (sales_executive_id, pipedrive_deal_id) WHERE pipedrive_deal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pa_se_activity ON public.pipedrive_activities (sales_executive_id, pipedrive_activity_id) WHERE pipedrive_activity_id IS NOT NULL;
