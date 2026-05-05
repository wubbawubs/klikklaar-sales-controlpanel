import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Building2, Phone, Mail, Globe, Tag, Calendar, FileText } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealTitle?: string | null;
  assignedAt?: string | null;
  leadAssignmentId?: string | null;
  orgName?: string | null;
  personName?: string | null;
  personPhone?: string | null;
  personEmail?: string | null;
  website?: string | null;
  branche?: string | null;
  productLine?: string | null;
  notes?: string | null;
  status?: string | null;
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
}

function Row({ icon: Icon, label, value }: { icon: typeof Phone; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/40 last:border-0">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm text-foreground break-words">{value}</div>
      </div>
    </div>
  );
}

export function LeadDetailSheet({
  open, onOpenChange, dealTitle, assignedAt, orgName, personName, personPhone,
  personEmail, website, branche, productLine, notes, status, onPrev, onNext,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {dealTitle || orgName || 'Lead'}
          </SheetTitle>
          {status && (
            <SheetDescription>
              <Badge variant="outline">{status}</Badge>
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-4 space-y-1">
          <Row icon={Building2} label="Organisatie" value={orgName} />
          <Row icon={Tag} label="Contact" value={personName} />
          <Row icon={Phone} label="Telefoon" value={personPhone} />
          <Row icon={Mail} label="E-mail" value={personEmail} />
          <Row icon={Globe} label="Website" value={website} />
          <Row icon={Tag} label="Branche" value={branche} />
          <Row icon={Tag} label="Productlijn" value={productLine} />
          <Row icon={Calendar} label="Toegewezen op" value={assignedAt ? new Date(assignedAt).toLocaleDateString('nl-NL') : null} />
          <Row icon={FileText} label="Notities" value={notes} />
        </div>

        {(onPrev || onNext) && (
          <div className="mt-6 flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={!onPrev} onClick={() => onPrev?.()}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Vorige
            </Button>
            <Button variant="outline" size="sm" disabled={!onNext} onClick={() => onNext?.()}>
              Volgende <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
