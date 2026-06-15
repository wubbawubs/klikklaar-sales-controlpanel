-- Link Trello-style boards to a client (company). Additive + nullable so
-- existing boards and board creation are unaffected.
ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_boards_company ON public.boards(company_id);
