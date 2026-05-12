import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StickyNote, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface NoteRow {
  id: string;
  note: string | null;
  created_at: string | null;
}

interface Props {
  leadAssignmentId: string;
  salesExecutiveId: string;
}

/**
 * Mouse-only notitie-knop voor een lead-rij.
 * Doet NIET mee in Tab-volgorde (tabIndex=-1) zodat de belflow niet verstoord wordt.
 */
export function LeadNoteButton({ leadAssignmentId, salesExecutiveId }: Props) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');
  const [hasNotes, setHasNotes] = useState(false);

  // Lightweight check on mount voor indicator-dot
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('crm_activities')
        .select('id', { count: 'exact', head: true })
        .eq('lead_assignment_id', leadAssignmentId)
        .eq('activity_type', 'note');
      if (!cancelled) setHasNotes((count ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [leadAssignmentId]);

  const loadNotes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('crm_activities')
      .select('id, note, created_at')
      .eq('lead_assignment_id', leadAssignmentId)
      .eq('activity_type', 'note')
      .order('created_at', { ascending: false });
    setNotes((data as NoteRow[]) || []);
    setHasNotes(((data as NoteRow[]) || []).length > 0);
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    const { error } = await supabase.from('crm_activities').insert({
      sales_executive_id: salesExecutiveId,
      lead_assignment_id: leadAssignmentId,
      activity_type: 'note',
      note: text,
      done: true,
    });
    setSaving(false);
    if (error) {
      toast.error('Opslaan mislukt: ' + error.message);
      return;
    }
    setDraft('');
    toast.success('Notitie opgeslagen');
    loadNotes();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          aria-label="Notities"
          title="Notities (muis only)"
          className={cn(
            'relative inline-flex items-center justify-center h-7 w-7 rounded-md border border-border/60 bg-background hover:bg-muted transition-colors',
            hasNotes && 'border-primary/40 text-primary'
          )}
        >
          <StickyNote className="h-3.5 w-3.5" />
          {hasNotes && (
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-3"
        align="end"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <StickyNote className="h-3.5 w-3.5" /> Notities
          </div>

          <div className="max-h-44 overflow-y-auto space-y-1.5 -mx-1 px-1">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Laden,
              </div>
            ) : notes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">Nog geen notities.</p>
            ) : (
              notes.map(n => (
                <div key={n.id} className="rounded border border-border/50 bg-muted/30 p-2">
                  <p className="text-xs text-foreground whitespace-pre-wrap">{n.note}</p>
                  {n.created_at && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.created_at).toLocaleString('nl-NL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nieuwe notitie,"
            rows={3}
            className="text-xs resize-none"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={save} disabled={saving || !draft.trim()} className="h-7 text-xs">
              {saving ? 'Opslaan,' : 'Toevoegen'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
