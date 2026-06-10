import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Plus, Calendar, Tag, Pencil, X, Check } from 'lucide-react';
import { useBoard, useMoveCard, useCreateCard, useCreateList, useUpdateCard, type Card, type BoardList } from '@/hooks/useBoards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const LABEL_COLORS: Record<string, string> = {
  bug:     'bg-red-500/20 text-red-600',
  feature: 'bg-blue-500/20 text-blue-600',
  design:  'bg-purple-500/20 text-purple-600',
  urgent:  'bg-orange-500/20 text-orange-600',
  docs:    'bg-gray-500/20 text-gray-600',
};

function CardDetail({ card, boardId, onClose }: { card: Card; boardId: string; onClose: () => void }) {
  const updateCard = useUpdateCard(boardId);
  const [title, setTitle] = useState(card.title);
  const [desc, setDesc] = useState(card.description ?? '');
  const [due, setDue] = useState(card.due_date ?? '');
  const dirty = title !== card.title || desc !== (card.description ?? '') || due !== (card.due_date ?? '');

  const save = () => updateCard.mutate({ id: card.id, title, description: desc || null, due_date: due || null });

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="text-base font-semibold border-0 p-0 h-auto focus-visible:ring-0"
            />
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {/* Labels */}
          {card.labels?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {card.labels.map(l => (
                <Badge key={l} variant="secondary" className={cn('text-xs', LABEL_COLORS[l])}>
                  <Tag className="h-2.5 w-2.5 mr-1" />{l}
                </Badge>
              ))}
            </div>
          )}

          {/* Due date */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input type="date" value={due} onChange={e => setDue(e.target.value)} className="h-8 text-sm w-auto" />
          </div>

          {/* Description */}
          <Textarea
            placeholder="Beschrijving..."
            value={desc}
            onChange={e => setDesc(e.target.value)}
            className="min-h-[100px] text-sm resize-none"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Sluiten</Button>
          {dirty && <Button onClick={save} disabled={updateCard.isPending}>Opslaan</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddCardInline({ listId, boardId, onDone }: { listId: string; boardId: string; onDone: () => void }) {
  const createCard = useCreateCard(boardId);
  const [title, setTitle] = useState('');

  const submit = () => {
    if (!title.trim()) { onDone(); return; }
    createCard.mutate({ listId, title: title.trim(), position: 9999 }, { onSuccess: onDone });
  };

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <Input
        autoFocus
        placeholder="Kaarttitel..."
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onDone(); }}
        className="text-sm h-8"
      />
      <div className="flex gap-1">
        <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={createCard.isPending}>
          <Check className="h-3 w-3 mr-1" />Toevoegen
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDone}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function AddListInline({ boardId, position, onDone }: { boardId: string; position: number; onDone: () => void }) {
  const createList = useCreateList(boardId);
  const [name, setName] = useState('');

  const submit = () => {
    if (!name.trim()) { onDone(); return; }
    createList.mutate({ name: name.trim(), position }, { onSuccess: onDone });
  };

  return (
    <div className="flex flex-col gap-2 w-64 shrink-0 bg-muted/40 rounded-xl p-3">
      <Input
        autoFocus
        placeholder="Lijstnaam..."
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onDone(); }}
        className="text-sm h-8"
      />
      <div className="flex gap-1">
        <Button size="sm" className="h-7 text-xs flex-1" onClick={submit} disabled={createList.isPending}>
          Lijst aanmaken
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDone}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function BoardPage() {
  const { id: boardId } = useParams<{ id: string }>();
  const { data, isLoading } = useBoard(boardId!);
  const moveCard = useMoveCard(boardId!);
  const [addingCardTo, setAddingCardTo] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    moveCard.mutate({
      cardId: result.draggableId,
      listId: result.destination.droppableId,
      position: result.destination.index,
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-full"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const { lists = [], cards = [] } = data ?? {};
  const cardsForList = (listId: string) => cards.filter(c => c.list_id === listId).sort((a, b) => a.position - b.position);

  return (
    <div className="flex flex-col h-full">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 p-4 overflow-x-auto flex-1 min-h-0 items-start">
          {lists.map(list => (
            <div key={list.id} className="flex flex-col w-64 shrink-0 bg-muted/40 rounded-xl p-2.5 max-h-full">
              {/* List header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{list.name}</span>
                <Badge variant="secondary" className="text-xs px-1.5 py-0">{cardsForList(list.id).length}</Badge>
              </div>

              {/* Cards */}
              <Droppable droppableId={list.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'flex flex-col gap-2 flex-1 min-h-[40px] rounded-lg transition-colors overflow-y-auto',
                      snapshot.isDraggingOver && 'bg-muted/60'
                    )}
                  >
                    {cardsForList(list.id).map((card, i) => (
                      <Draggable key={card.id} draggableId={card.id} index={i}>
                        {(p, s) => (
                          <div
                            ref={p.innerRef}
                            {...p.draggableProps}
                            {...p.dragHandleProps}
                            onClick={() => setSelectedCard(card)}
                            className={cn(
                              'bg-card border rounded-lg p-2.5 cursor-pointer hover:border-primary/40 transition-colors select-none',
                              s.isDragging && 'shadow-md ring-1 ring-primary/20'
                            )}
                          >
                            <p className="text-sm leading-snug">{card.title}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {card.due_date && (
                                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                  <Calendar className="h-2.5 w-2.5" />
                                  {new Date(card.due_date).toLocaleDateString('nl', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                              {card.labels?.map(l => (
                                <span key={l} className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', LABEL_COLORS[l] ?? 'bg-gray-100 text-gray-600')}>{l}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              {/* Add card */}
              {addingCardTo === list.id ? (
                <AddCardInline listId={list.id} boardId={boardId!} onDone={() => setAddingCardTo(null)} />
              ) : (
                <button
                  onClick={() => setAddingCardTo(list.id)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-2 px-1 py-1 rounded hover:bg-muted/60 transition-colors w-full"
                >
                  <Plus className="h-3.5 w-3.5" />Kaart toevoegen
                </button>
              )}
            </div>
          ))}

          {/* Add list */}
          {addingList ? (
            <AddListInline boardId={boardId!} position={lists.length} onDone={() => setAddingList(false)} />
          ) : (
            <button
              onClick={() => setAddingList(true)}
              className="flex items-center gap-2 w-64 shrink-0 h-10 px-3 rounded-xl border-2 border-dashed border-muted-foreground/30 text-sm text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />Lijst toevoegen
            </button>
          )}
        </div>
      </DragDropContext>

      {selectedCard && (
        <CardDetail card={selectedCard} boardId={boardId!} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );
}
