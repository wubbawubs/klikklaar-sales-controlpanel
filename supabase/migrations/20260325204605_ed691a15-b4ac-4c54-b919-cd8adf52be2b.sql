
-- Create forms table
CREATE TABLE public.forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  settings_json jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create form_questions table
CREATE TABLE public.form_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_type text NOT NULL,
  options_json jsonb,
  required boolean DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  settings_json jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create form_submissions table
CREATE TABLE public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  submitted_at timestamptz DEFAULT now(),
  metadata_json jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create submission_answers table
CREATE TABLE public.submission_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.form_questions(id) ON DELETE CASCADE,
  answer_text text,
  answer_json jsonb
);

-- Create eod_submission_data table (denormalized for analytics)
CREATE TABLE public.eod_submission_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  employee_name text,
  team text,
  work_date date,
  calls_attempted integer DEFAULT 0,
  real_conversations integer DEFAULT 0,
  appointments_set integer DEFAULT 0,
  followups_set integer DEFAULT 0,
  deals_closed integer DEFAULT 0,
  day_score integer,
  energy_score integer,
  product_lines text[],
  good_things text,
  blocker_text text,
  coaching_text text,
  focus_tomorrow text,
  extra_notes text,
  metadata_json jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eod_submission_data ENABLE ROW LEVEL SECURITY;

-- Forms policies
CREATE POLICY "Admins can manage forms" ON public.forms FOR ALL TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Anyone can read active forms" ON public.forms FOR SELECT TO anon, authenticated USING (status = 'active');

-- Questions policies
CREATE POLICY "Admins can manage questions" ON public.form_questions FOR ALL TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Anyone can read questions of active forms" ON public.form_questions FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM public.forms WHERE id = form_id AND status = 'active')
);

-- Submissions policies
CREATE POLICY "Admins can manage submissions" ON public.form_submissions FOR ALL TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Anyone can create submissions" ON public.form_submissions FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Answers policies
CREATE POLICY "Admins can manage answers" ON public.submission_answers FOR ALL TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Anyone can create answers" ON public.submission_answers FOR INSERT TO anon, authenticated WITH CHECK (true);

-- EOD data policies
CREATE POLICY "Admins can manage eod data" ON public.eod_submission_data FOR ALL TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Anyone can create eod data" ON public.eod_submission_data FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Indexes
CREATE INDEX idx_form_questions_form_id ON public.form_questions(form_id);
CREATE INDEX idx_form_questions_order ON public.form_questions(form_id, order_index);
CREATE INDEX idx_form_submissions_form_id ON public.form_submissions(form_id);
CREATE INDEX idx_form_submissions_submitted_at ON public.form_submissions(submitted_at);
CREATE INDEX idx_submission_answers_submission_id ON public.submission_answers(submission_id);
CREATE INDEX idx_eod_data_form_id ON public.eod_submission_data(form_id);
CREATE INDEX idx_eod_data_work_date ON public.eod_submission_data(work_date);
CREATE INDEX idx_eod_data_team ON public.eod_submission_data(team);
CREATE INDEX idx_eod_data_employee ON public.eod_submission_data(employee_name);
CREATE INDEX idx_forms_slug ON public.forms(slug);

-- Updated_at trigger for forms
CREATE TRIGGER update_forms_updated_at BEFORE UPDATE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
