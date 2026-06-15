import { useState } from 'react';
import { Check, ChevronsUpDown, Building2, Plus } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const CRM_COLORS = ['#0F9B7A', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899', '#06B6D4'];

function NewCrmDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createOrganization } = useOrganization();
  const [name, setName] = useState('');
  const [color, setColor] = useState(CRM_COLORS[0]!);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createOrganization({ name: name.trim(), color });
      toast.success(`CRM "${name.trim()}" aangemaakt`);
      setName(''); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kon CRM niet aanmaken');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nieuw CRM / bedrijf</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <Input placeholder="Naam (bv. LeadLayer)" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <div className="flex gap-2 flex-wrap">
            {CRM_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="h-7 w-7 rounded-full border-2 transition-all"
                style={{ backgroundColor: c, borderColor: color === c ? '#000' : 'transparent' }} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Een eigen pipeline, boards en klanten — gescheiden van je andere merken.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button onClick={submit} disabled={!name.trim() || busy}>{busy ? 'Aanmaken…' : 'Aanmaken'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BrandSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { current, available, switchTo } = useOrganization();
  const { isAdmin } = useAuth();
  const [addOpen, setAddOpen] = useState(false);

  if (!current) return null;

  // Non-admins with a single brand: static label (no add, no switch).
  if (available.length <= 1 && !isAdmin) {
    return (
      <div className={cn('flex items-center gap-2 px-2 py-1.5', collapsed && 'justify-center px-0')}>
        {current.logo_url ? (
          <img src={current.logo_url} alt={current.name} className="h-6 w-6 rounded object-contain bg-white/10 p-0.5" />
        ) : (
          <Building2 className="h-4 w-4 text-sidebar-foreground/60" />
        )}
        {!collapsed && <span className="text-xs font-medium text-sidebar-foreground/80 truncate">{current.name}</span>}
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-hover text-sidebar-foreground/85 transition-colors',
              collapsed && 'justify-center px-0'
            )}
          >
            {current.logo_url ? (
              <img src={current.logo_url} alt={current.name} className="h-6 w-6 rounded object-contain bg-white/10 p-0.5" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            {!collapsed && (
              <>
                <span className="flex-1 text-left text-xs font-semibold truncate">{current.name}</span>
                <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs">Wissel CRM / merk</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {available.map(o => (
            <DropdownMenuItem key={o.id} onClick={() => switchTo(o.id)} className="gap-2">
              {o.logo_url ? (
                <img src={o.logo_url} alt={o.name} className="h-5 w-5 rounded object-contain" />
              ) : (
                <span className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ backgroundColor: o.primary_color_hex ?? '#0F9B7A' }}>
                  {o.name.charAt(0)}
                </span>
              )}
              <span className="flex-1 truncate">{o.name}</span>
              {current.id === o.id && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAddOpen(true)} className="gap-2 text-primary">
                <Plus className="h-4 w-4" /> Nieuw CRM / bedrijf
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NewCrmDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
