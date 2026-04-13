import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

const routeLabels: Record<string, string> = {
  '': 'Dashboard',
  'sales-executives': 'Sales Executives',
  'new': 'Nieuw',
  'edit': 'Bewerken',
  'leads': 'Leads & CRM',
  'training': 'Training',
  'evaluaties': 'Evaluaties',
  'formulieren': 'Formulieren',
  'responses': 'Responses',
  'analytics': 'Analytics',
  'settings': 'Instellingen',
  'users': 'Gebruikers',
  'artifacts': 'Exports',
  'integraties': 'Integraties',
  'integrations': 'Integraties',
  'notifications': 'Notificaties',
  'account': 'Account',
  'eod': 'EOD',
};

function isUUID(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  // Don't show breadcrumbs on root
  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/');
    const label = isUUID(seg) ? 'Detail' : (routeLabels[seg] || seg);
    const isLast = i === segments.length - 1;
    return { path, label, isLast };
  });

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4" aria-label="Breadcrumbs">
      <Link to="/" className="flex items-center gap-1 hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground">{crumb.label}</span>
          ) : (
            <Link to={crumb.path} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
