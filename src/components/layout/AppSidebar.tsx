import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  UserPlus,
  Users,
  Package,
  FileJson,
  Plug,
  GraduationCap,
  ClipboardCheck,
  Settings,
  ScrollText,
  LogOut,
  ListChecks,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sales-executives', icon: Users, label: 'Sales Executives' },
  { to: '/sales-executives/new', icon: UserPlus, label: 'Nieuwe SE' },
  { to: '/provisioning', icon: Package, label: 'Provisioning' },
  { to: '/artifacts', icon: FileJson, label: 'Artifacts' },
  { to: '/integrations', icon: Plug, label: 'Integraties' },
  { to: '/training', icon: GraduationCap, label: 'Training' },
  { to: '/eod', icon: ClipboardCheck, label: 'EOD Beheer' },
  { to: '/evaluaties', icon: ListChecks, label: 'Evaluaties' },
  { to: '/settings', icon: Settings, label: 'Instellingen' },
  { to: '/audit-logs', icon: ScrollText, label: 'Audit Logs' },
];

export function AppSidebar() {
  const { signOut, user } = useAuth();
  const location = useLocation();

  return (
    <aside className="flex flex-col h-screen w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-5 border-b border-sidebar-border">
        <h1 className="text-lg font-bold text-sidebar-primary-foreground">Klikklaar SEO</h1>
        <p className="text-xs text-sidebar-foreground/60 mt-0.5">Control Center</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-3 px-5 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <p className="text-xs text-sidebar-foreground/60 truncate mb-2">{user?.email}</p>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Uitloggen
        </button>
      </div>
    </aside>
  );
}
