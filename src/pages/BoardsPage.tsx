import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Layout, Building2 } from 'lucide-react';
import { useBoards, useCreateBoard, useClients, useCreateClient } from '@/hooks/useBoards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const BOARD_COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#EC4899','#06B6D4'];
const NEW_CLIENT = '__new__';
const NO_CLIENT = '__none__';

export default function BoardsPage() {
  const { data: boards = [] } = useBoards();
  const { data: clients = [] } = useClients();
  const createBoard = useCreateBoard();
  const createClient = useCreateClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(BOARD_COLORS[0]!);
  const [clientId, setClientId] = useState<string>(NO_CLIENT);
  const [newClientName, setNewClientName] = useState('');

  const reset = () => {
    setOpen(false); setName(''); setDesc(''); setClientId(NO_CLIENT); setNewClientName('');
  };

  const submit = async () => {
    if (!name.trim()) return;
    // Create the client first if "new client" was chosen.
    let companyId: string | null = clientId === NO_CLIENT || clientId === NEW_CLIENT ? null : clientId;
    if (clientId === NEW_CLIENT && newClientName.trim()) {
      const created = await createClient.mutateAsync(newClientName.trim());
      companyId = created.id;
    }
    createBoard.mutate(
      { name: name.trim(), description: desc || undefined, color, companyId },
      { onSuccess: reset },
    );
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Boards</h1>
          <p className="text-sm text-muted-foreground">Product planning, roadmaps en dev boards</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Nieuw board</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {boards.map(b => (
          <button
            key={b.id}
            onClick={() => navigate(`/boards/${b.id}`)}
            className="group relative aspect-video rounded-xl overflow-hidden border hover:border-primary/50 transition-all hover:shadow-md text-left"
            style={{ backgroundColor: b.color + '20' }}
          >
            <div className="absolute inset-0 p-3 flex flex-col justify-between">
              <div className="h-6 w-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: b.color }}>
                <Layout className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                {b.company?.name && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-foreground/70 mb-1">
                    <Building2 className="h-3 w-3" />{b.company.name}
                  </span>
                )}
                <p className="text-sm font-semibold leading-tight truncate">{b.name}</p>
                {b.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{b.description}</p>}
              </div>
            </div>
          </button>
        ))}

        {boards.length === 0 && (
          <button
            onClick={() => setOpen(true)}
            className="aspect-video rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-5 w-5" />
            <span className="text-xs font-medium">Eerste board</span>
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nieuw board</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            <Input placeholder="Naam (bv. Warmland — Project)" value={name} onChange={e => setName(e.target.value)} autoFocus />
            <Input placeholder="Beschrijving (optioneel)" value={desc} onChange={e => setDesc(e.target.value)} />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Klant (optioneel)</label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>Geen klant</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  <SelectItem value={NEW_CLIENT}>+ Nieuwe klant…</SelectItem>
                </SelectContent>
              </Select>
              {clientId === NEW_CLIENT && (
                <Input placeholder="Naam nieuwe klant" value={newClientName} onChange={e => setNewClientName(e.target.value)} />
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {BOARD_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2 transition-all"
                  style={{ backgroundColor: c, borderColor: color === c ? '#000' : 'transparent' }}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={reset}>Annuleren</Button>
            <Button onClick={submit} disabled={!name.trim() || createBoard.isPending || createClient.isPending}>Aanmaken</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
