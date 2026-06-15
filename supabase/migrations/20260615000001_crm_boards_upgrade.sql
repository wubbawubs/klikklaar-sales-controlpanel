-- CRM + boards "next level" upgrade.

-- 1. Lead enrichment: LinkedIn on contacts.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS linkedin text;

-- 2. Trello card members (tag multiple people on a card).
CREATE TABLE IF NOT EXISTS public.card_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.board_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (card_id, user_id)
);
ALTER TABLE public.card_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage card members" ON public.card_members;
CREATE POLICY "Org members manage card members" ON public.card_members FOR ALL
  USING (card_id IN (
    SELECT c.id FROM public.board_cards c JOIN public.boards b ON b.id = c.board_id
    WHERE b.org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid())
  ));

-- 3. Trello card attachments (pictures / files).
CREATE TABLE IF NOT EXISTS public.card_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.board_cards(id) ON DELETE CASCADE,
  url text NOT NULL,
  name text,
  mime_type text,
  uploaded_by uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.card_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members manage card attachments" ON public.card_attachments;
CREATE POLICY "Org members manage card attachments" ON public.card_attachments FOR ALL
  USING (card_id IN (
    SELECT c.id FROM public.board_cards c JOIN public.boards b ON b.id = c.board_id
    WHERE b.org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid())
  ));

-- 4. Storage bucket for card attachments (public read, authenticated write).
INSERT INTO storage.buckets (id, name, public)
  VALUES ('card-attachments', 'card-attachments', true)
  ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "card attachments authenticated upload" ON storage.objects;
CREATE POLICY "card attachments authenticated upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'card-attachments');
DROP POLICY IF EXISTS "card attachments public read" ON storage.objects;
CREATE POLICY "card attachments public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'card-attachments');
DROP POLICY IF EXISTS "card attachments owner delete" ON storage.objects;
CREATE POLICY "card attachments owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'card-attachments');

-- 5. Let org co-members see each other's profiles (needed to tag teammates).
DROP POLICY IF EXISTS "Org co-members can view profiles" ON public.profiles;
CREATE POLICY "Org co-members can view profiles" ON public.profiles FOR SELECT
  USING (user_id IN (
    SELECT uo2.user_id FROM public.user_organizations uo1
    JOIN public.user_organizations uo2 ON uo1.organization_id = uo2.organization_id
    WHERE uo1.user_id = auth.uid()
  ));
