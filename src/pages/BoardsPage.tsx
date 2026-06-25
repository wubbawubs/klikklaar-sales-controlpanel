import { useNavigate } from 'react-router-dom';
import { Layout, Building2 } from 'lucide-react';
import { useBoards } from '@/hooks/useBoards';

export default function BoardsPage() {
  const { data: boards = [] } = useBoards();
  const navigate = useNavigate();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Boards</h1>
        <p className="text-sm text-muted-foreground">Product planning, roadmaps en dev boards</p>
      </div>

      {boards.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Nog geen boards.</p>
      ) : (
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
        </div>
      )}
    </div>
  );
}
