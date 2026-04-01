ALTER TABLE public.pipedrive_lead_assignments ADD COLUMN IF NOT EXISTS website text DEFAULT NULL;
ALTER TABLE public.pipedrive_lead_assignments ADD COLUMN IF NOT EXISTS branche text DEFAULT NULL;