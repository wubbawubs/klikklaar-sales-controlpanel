-- Trello-style boards
CREATE TABLE public.boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage boards" ON public.boards FOR ALL
  USING (org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid()));
CREATE TRIGGER update_boards_updated_at BEFORE UPDATE ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lists (columns on a board)
CREATE TABLE public.board_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.board_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage lists" ON public.board_lists FOR ALL
  USING (board_id IN (
    SELECT b.id FROM public.boards b
    WHERE b.org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid())
  ));

-- Cards (items on a list)
CREATE TABLE public.board_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES public.board_lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  due_date DATE,
  position INT NOT NULL DEFAULT 0,
  labels TEXT[] DEFAULT '{}', -- e.g. ['bug', 'feature']
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.board_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage cards" ON public.board_cards FOR ALL
  USING (board_id IN (
    SELECT b.id FROM public.boards b
    WHERE b.org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid())
  ));
CREATE TRIGGER update_board_cards_updated_at BEFORE UPDATE ON public.board_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Card comments
CREATE TABLE public.card_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.board_cards(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.card_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can manage comments" ON public.card_comments FOR ALL
  USING (card_id IN (
    SELECT c.id FROM public.board_cards c
    JOIN public.boards b ON b.id = c.board_id
    WHERE b.org_id IN (SELECT organization_id FROM public.user_organizations WHERE user_id = auth.uid())
  ));
