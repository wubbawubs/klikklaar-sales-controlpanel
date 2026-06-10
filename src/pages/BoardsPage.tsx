import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Layout } from 'lucide-react';
import { useBoards, useCreateBoard } from '@/hooks/useBoards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const BOARD_COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#EC4899','#06B6D4'];

export default function BoardsPage() {
  const { data: boards = [] } = useBoards();
  const createBoard = useCreateBoard();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(BOARD_COLORS[0]!);

  const submit = () => {
    if (!name.trim()) return;
    createBoard.mutate({ name: name.trim(), description: desc || undefined, color }, {
      onSuccess: () => { setOpen(false); setName(''); setDesc(''); },
    });
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
            <Input placeholder="Naam (bv. LeadLayer Roadmap)" value={name} onChange={e => setName(e.target.value)} autoFocus />
            <Input placeholder="Beschrijving (optioneel)" value={desc} onChange={e => setDesc(e.target.value)} />
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
            <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={submit} disabled={!name.trim() || createBoard.isPending}>Aanmaken</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
