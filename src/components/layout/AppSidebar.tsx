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
  Target,
  Phone,
  X,
  GitBranch,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import klikklaarLogo from '@/assets/klikklaar-logo.png';

interface NavItem {
  to: string;
  icon: any;
  label: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sales-executives', icon: Users, label: 'Sales Executives', adminOnly: true },
  { to: '/sales-executives/new', icon: UserPlus, label: 'Nieuwe SE', adminOnly: true },
  { to: '/provisioning', icon: Package, label: 'Provisioning', adminOnly: true },
  { to: '/artifacts', icon: FileJson, label: 'Artifacts', adminOnly: true },
  { to: '/leads', icon: Target, label: 'Mijn Leads' },
  { to: '/calls', icon: Phone, label: 'Call Logging' },
  { to: '/integrations', icon: Plug, label: 'Integraties', adminOnly: true },
  { to: '/training', icon: GraduationCap, label: 'Training' },
  { to: '/eod', icon: ClipboardCheck, label: 'EOD Beheer' },
  { to: '/evaluaties', icon: ListChecks, label: 'Evaluaties', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Instellingen', adminOnly: true },
  { to: '/audit-logs', icon: ScrollText, label: 'Audit Logs', adminOnly: true },
];

interface AppSidebarProps {
  onCloseMobile?: () => void;
}

export function AppSidebar({ onCloseMobile }: AppSidebarProps) {
  const { signOut, user, isAdmin, roles } = useAuth();
  const location = useLocation();
  const isCoachOrAdmin = isAdmin || roles.includes('coach');

  const visibleItems = navItems.filter(item => {
    if (!item.adminOnly) return true;
    return isCoachOrAdmin;
  });

  const handleNavClick = () => {
    // Close mobile sidebar on navigation
    onCloseMobile?.();
  };

  return (
    <aside className="flex flex-col h-screen w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Brand header */}
      <div className="px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={klikklaarLogo} alt="KlikKlaar SEO" className="h-8" />
            <div>
              <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">Control Center</h1>
            </div>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={onCloseMobile}
            className="p-1 rounded-lg hover:bg-sidebar-accent transition-colors lg:hidden"
            aria-label="Sluit menu"
          >
            <X className="h-5 w-5 text-sidebar-foreground/70" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        <div className="space-y-0.5">
          {visibleItems.map(({ to, icon: Icon, label }) => {
            const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                onClick={handleNavClick}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all duration-150',
                  isActive
                    ? 'bg-sidebar-primary/15 text-sidebar-primary font-medium shadow-sm'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-sidebar-primary')} />
                {label}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* User footer */}
      <div className="border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-accent-foreground uppercase shrink-0">
            {user?.email?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-sidebar-foreground/80 truncate">{user?.email}</p>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-[11px] text-sidebar-foreground/50 hover:text-sidebar-primary transition-colors mt-0.5"
            >
              <LogOut className="h-3 w-3" />
              Uitloggen
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
