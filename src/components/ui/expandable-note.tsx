import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StickyNote, FileText, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExpandableNoteProps {
  text: string;
  title?: string;
  icon?: 'sticky' | 'file';
  className?: string;
  lineClamp?: number;
  stripHtml?: boolean;
}

export function ExpandableNote({ text, title = 'Notitie', icon = 'sticky', className, lineClamp = 2, stripHtml = false }: ExpandableNoteProps) {
  const [open, setOpen] = useState(false);
  const displayText = stripHtml ? text.replace(/<[^>]*>/g, '') : text;
  const Icon = icon === 'file' ? FileText : StickyNote;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          'flex items-start gap-1 text-left group hover:bg-muted/50 rounded px-1 -mx-1 transition-colors',
          className
        )}
        title="Klik om volledig te lezen"
      >
        <Icon className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
        <span className={cn('text-[11px] text-muted-foreground', lineClamp === 2 && 'line-clamp-2', lineClamp === 3 && 'line-clamp-3')}>
          {displayText}
        </span>
        <Maximize2 className="h-2.5 w-2.5 text-muted-foreground/0 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh]" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Icon className="h-4 w-4" />
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed overflow-y-auto max-h-[60vh]">
            {displayText}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
