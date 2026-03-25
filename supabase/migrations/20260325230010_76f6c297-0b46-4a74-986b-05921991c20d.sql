
-- Table to store which Pipedrive organizations/persons are assigned to which sales executive
CREATE TABLE public.pipedrive_lead_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_executive_id uuid NOT NULL REFERENCES public.sales_executives(id) ON DELETE CASCADE,
  pipedrive_org_id integer,
  pipedrive_person_id integer,
  pipedrive_deal_id integer,
  org_name text,
  person_name text,
  person_email text,
  person_phone text,
  deal_title text,
  product_line text,
  status text NOT NULL DEFAULT 'assigned',
  notes text,
  assigned_at timestamptz DEFAULT now(),
  assigned_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table to track activities/calls logged against leads
CREATE TABLE public.pipedrive_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_executive_id uuid NOT NULL REFERENCES public.sales_executives(id) ON DELETE CASCADE,
  lead_assignment_id uuid REFERENCES public.pipedrive_lead_assignments(id) ON DELETE SET NULL,
  pipedrive_activity_id integer,
  pipedrive_org_id integer,
  pipedrive_person_id integer,
  pipedrive_deal_id integer,
  activity_type text NOT NULL DEFAULT 'call',
  subject text,
  note text,
  outcome text,
  done boolean DEFAULT false,
  due_date date,
  duration_minutes integer,
  synced_to_pipedrive boolean DEFAULT false,
  pipedrive_sync_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pipedrive_lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipedrive_activities ENABLE ROW LEVEL SECURITY;

-- RLS policies for lead assignments
CREATE POLICY "Admins can manage lead assignments" ON public.pipedrive_lead_assignments
  FOR ALL TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Coaches can view lead assignments" ON public.pipedrive_lead_assignments
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'coach'));

-- RLS policies for activities
CREATE POLICY "Admins can manage activities" ON public.pipedrive_activities
  FOR ALL TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Coaches can view activities" ON public.pipedrive_activities
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'coach'));

-- Triggers for updated_at
CREATE TRIGGER set_updated_at_lead_assignments
  BEFORE UPDATE ON public.pipedrive_lead_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_activities
  BEFORE UPDATE ON public.pipedrive_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
