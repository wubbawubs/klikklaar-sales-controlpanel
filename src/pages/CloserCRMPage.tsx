import { CloserKanban } from '@/components/closer/CloserKanban';
import { Handshake } from 'lucide-react';

export default function CloserCRMPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Handshake className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Closer CRM</h1>
          <p className="text-sm text-muted-foreground">Jouw afspraken via Calendly, ingedeeld per status.</p>
        </div>
      </div>

      <CloserKanban />
    </div>
  );
}
