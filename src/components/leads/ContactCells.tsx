import { Phone, Globe, Copy } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PhoneCellProps {
  phone: string | null;
  className?: string;
}

export function PhoneCell({ phone, className }: PhoneCellProps) {
  const isMobile = useIsMobile();

  if (!phone) return <span className="text-xs text-muted-foreground">—</span>;

  const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (isMobile) {
      window.location.href = `tel:${phone}`;
    } else {
      navigator.clipboard.writeText(phone).then(
        () => toast.success(`Gekopieerd: ${phone}`),
        () => toast.error('Kopiëren mislukt'),
      );
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  };

  return (
    <button
      type="button"
      data-phone-cell
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKey}
      title={isMobile ? 'Bellen' : 'Klik om te kopiëren (of Enter)'}
      className={cn(
        'inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary',
        'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:text-primary rounded px-1 py-0.5 -mx-1 -my-0.5',
        className,
      )}
    >
      {isMobile ? <Phone className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0 opacity-60" />}
      <span className="truncate max-w-[120px] font-mono">{phone}</span>
    </button>
  );
}

interface WebsiteCellProps {
  website: string | null;
  className?: string;
}

export function WebsiteCell({ website, className }: WebsiteCellProps) {
  if (!website) return <span className="text-xs text-muted-foreground">—</span>;

  const url = website.startsWith('http') ? website : `https://${website}`;
  const display = website.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const handleClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  };

  return (
    <button
      type="button"
      data-website-cell
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKey}
      title="Open website (Enter)"
      className={cn(
        'inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary',
        'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:text-primary rounded px-1 py-0.5 -mx-1 -my-0.5',
        className,
      )}
    >
      <Globe className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-[140px]">{display}</span>
    </button>
  );
}
