import { CloserKanban } from '@/components/closer/CloserKanban';
import { Handshake } from 'lucide-react';

export default function CloserCRMPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
          <Handshake className="h-[18px] w-[18px] text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-page text-foreground">Closer CRM</h1>
          <p className="text-sm text-muted-foreground">Jouw afspraken via Calendly, ingedeeld per status.</p>
        </div>
      </div>

      <CloserKanban />
    </div>
  );
}
