import { useState } from 'react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useOrgId } from '@/hooks/useOrgId';
import { useTrash, useIsOrgAdmin, useRestoreBatch, usePurge } from '@/hooks/useTrash';
import type { TrashEntity, TrashItem } from '@/lib/crmTypes';

const ENTITY_LABEL: Record<TrashEntity, string> = {
  companies: 'Bedrijf', deals: 'Deal', contacts: 'Contact', deal_activities: 'Activiteit',
  crm_appointments: 'Afspraak', company_items: 'Document of notitie',
};

export default function TrashPage() {
  const orgId = useOrgId();
  const { data: items = [], isLoading } = useTrash();
  const { data: isOrgAdmin = false } = useIsOrgAdmin();
  const restore = useRestoreBatch();
  const purge = usePurge();
  const [toPurge, setToPurge] = useState<TrashItem | null>(null);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Prullenbak</h1>
        <p className="text-sm text-muted-foreground">
          Verwijderde bedrijven, deals, contacten, activiteiten, afspraken en documenten. Terugzetten herstelt alles wat tegelijk is verwijderd.
        </p>
      </div>

      {!orgId ? (
        <p className="text-sm text-muted-foreground border rounded-lg p-4">
          Kies een organisatie (niet "Algemeen") om de prullenbak te bekijken.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-lg p-4">De prullenbak is leeg.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {items.map(item => (
            <div key={`${item.entity}:${item.record_id}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{ENTITY_LABEL[item.entity] ?? item.entity}</Badge>
                  <span className="text-sm font-medium truncate">{item.label || '(zonder naam)'}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Verwijderd op {format(new Date(item.deleted_at), 'd MMM yyyy HH:mm', { locale: nl })}
                  {item.batch_size > 1 && ` · samen met ${item.batch_size - 1} gekoppelde ${item.batch_size - 1 === 1 ? 'item' : 'items'}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="gap-1"
                  disabled={!item.delete_batch || restore.isPending}
                  onClick={() => item.delete_batch && restore.mutate(item.delete_batch)}>
                  <RotateCcw className="h-3.5 w-3.5" />Terugzetten
                </Button>
                {isOrgAdmin && (
                  <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive"
                    disabled={purge.isPending} onClick={() => setToPurge(item)}>
                    <Trash2 className="h-3.5 w-3.5" />Definitief verwijderen
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!toPurge} onOpenChange={open => { if (!open) setToPurge(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Definitief verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toPurge?.label || '(zonder naam)'}"
              {toPurge && toPurge.batch_size > 1 ? ` en ${toPurge.batch_size - 1} gekoppelde items worden` : ' wordt'} permanent
              verwijderd. Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (toPurge) purge.mutate({ entity: toPurge.entity, recordId: toPurge.record_id }); setToPurge(null); }}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
