import { useRef, useState } from 'react';
import { FileText, StickyNote, Trash2, Pencil, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompanyItems, useSaveCompanyNote, useUploadCompanyDocument, useDeleteCompanyItem, openCompanyDocument, type CompanyItem, type ItemCategory } from '@/hooks/useCompanyHub';
import { cn } from '@/lib/utils';

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: 'preparation', label: 'Voorbereiding' }, { value: 'intake', label: 'Intake' }, { value: 'other', label: 'Overig' },
];
const fmtDate = (s: string) => new Date(s).toLocaleString('nl', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtSize = (b: number | null) => (b == null ? '' : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} kB`);

function NoteEditor({ companyId, item, onDone }: { companyId: string; item?: CompanyItem; onDone: () => void }) {
  const save = useSaveCompanyNote();
  const [category, setCategory] = useState<ItemCategory>(item?.category ?? 'preparation');
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex gap-2">
        <Select value={category} onValueChange={v => setCategory(v as ItemCategory)}>
          <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
        <Input className="h-8" placeholder="Titel, bv. Salesvoorbereiding" value={title} onChange={e => setTitle(e.target.value)} />
      </div>
      <Textarea className="min-h-[220px] text-sm" placeholder="Wat weten we over dit bedrijf, wie beslist, pijnpunten, aanpak…" value={body} onChange={e => setBody(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>Annuleren</Button>
        <Button size="sm" disabled={!body.trim() || save.isPending}
          onClick={() => save.mutate({ id: item?.id, companyId, category, title: title.trim() || 'Notitie', body }, { onSuccess: onDone })}>
          Opslaan
        </Button>
      </div>
    </div>
  );
}

function DocUploader({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const upload = useUploadCompanyDocument();
  const [category, setCategory] = useState<ItemCategory>('intake');
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const send = (files: FileList | null) => {
    const file = files?.[0];
    if (file) upload.mutate({ companyId, category, file }, { onSuccess: onDone });
  };
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <Select value={category} onValueChange={v => setCategory(v as ItemCategory)}>
        <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
        <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
      </Select>
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
        className={cn('border-2 border-dashed rounded-lg p-6 text-center text-sm cursor-pointer text-muted-foreground', drag && 'border-primary bg-primary/5')}
      >
        <Upload className="h-5 w-5 mx-auto mb-1" />
        {upload.isPending ? 'Uploaden…' : 'Sleep een bestand hierheen of klik (max 20 MB)'}
        <input ref={input} type="file" className="hidden" onChange={e => send(e.target.files)} />
      </div>
      <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={onDone}>Annuleren</Button></div>
    </div>
  );
}

function ItemRow({ item, onEdit }: { item: CompanyItem; onEdit: () => void }) {
  const del = useDeleteCompanyItem();
  const [open, setOpen] = useState(false);
  const isDoc = item.item_type === 'document';
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start gap-2">
        {isDoc ? <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" /> : <StickyNote className="h-4 w-4 mt-0.5 text-muted-foreground" />}
        <div className="flex-1 min-w-0">
          <button className="text-sm font-medium text-left hover:underline truncate block max-w-full"
            onClick={() => (isDoc ? openCompanyDocument(item.storage_path!) : setOpen(o => !o))}>
            {item.title || item.file_name}
          </button>
          <p className="text-xs text-muted-foreground">{fmtDate(item.created_at)}{isDoc && ` · ${fmtSize(item.size_bytes)}`}</p>
        </div>
        {!isDoc && <button onClick={onEdit} className="text-muted-foreground hover:text-foreground" aria-label="Bewerken"><Pencil className="h-3.5 w-3.5" /></button>}
        <button onClick={() => del.mutate(item)} className="text-muted-foreground hover:text-destructive" aria-label="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {!isDoc && (
        <p className={cn('text-sm whitespace-pre-wrap mt-2 text-foreground/90', !open && 'line-clamp-3')} onClick={() => setOpen(o => !o)}>{item.body}</p>
      )}
    </div>
  );
}

export function PrepIntakeTab({ companyId }: { companyId: string | null }) {
  const { data: items = [], isLoading } = useCompanyItems(companyId);
  const [mode, setMode] = useState<'idle' | 'choose' | 'note' | 'doc'>('idle');
  const [editing, setEditing] = useState<CompanyItem | null>(null);

  if (!companyId) return <p className="text-sm text-muted-foreground">Koppel eerst een bedrijf (links) om voorbereiding en intake vast te leggen.</p>;
  if (isLoading) return null;

  const adder = mode === 'note' ? <NoteEditor companyId={companyId} onDone={() => setMode('idle')} />
    : mode === 'doc' ? <DocUploader companyId={companyId} onDone={() => setMode('idle')} />
    : mode === 'choose' ? (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMode('note')}><StickyNote className="h-4 w-4" /> Notitie</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMode('doc')}><FileText className="h-4 w-4" /> Document</Button>
      </div>
    ) : (
      <Button size="sm" variant={items.length ? 'ghost' : 'outline'} onClick={() => setMode('choose')}>+ Voorbereiding of intake toevoegen</Button>
    );

  return (
    <div className="space-y-5">
      {adder}
      {CATEGORIES.map(cat => {
        const list = items.filter(i => i.category === cat.value);
        if (!list.length) return null;
        return (
          <section key={cat.value} className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{cat.label}</h3>
            {list.map(item => editing?.id === item.id
              ? <NoteEditor key={item.id} companyId={companyId} item={item} onDone={() => setEditing(null)} />
              : <ItemRow key={item.id} item={item} onEdit={() => setEditing(item)} />)}
          </section>
        );
      })}
    </div>
  );
}
