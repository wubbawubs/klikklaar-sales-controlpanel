
-- Create training_documents table
CREATE TABLE public.training_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.training_documents ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view training documents
CREATE POLICY "Authenticated users can view training documents"
ON public.training_documents
FOR SELECT
TO authenticated
USING (true);

-- Only admins/coaches can manage training documents
CREATE POLICY "Admins can manage training documents"
ON public.training_documents
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'coach'));

-- Create storage bucket for training documents
INSERT INTO storage.buckets (id, name, public) VALUES ('training-documents', 'training-documents', true);

-- Allow authenticated users to read training files
CREATE POLICY "Authenticated users can read training files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'training-documents');

-- Allow admins to upload training files
CREATE POLICY "Admins can upload training files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'training-documents' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'coach')));
