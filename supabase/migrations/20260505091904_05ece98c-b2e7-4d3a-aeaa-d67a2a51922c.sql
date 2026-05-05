INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view org logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');

CREATE POLICY "Admins manage org logos"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'org-logos' AND is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'org-logos' AND is_admin(auth.uid()));