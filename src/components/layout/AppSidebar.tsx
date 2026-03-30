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
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import klikklaarIcon from '@/assets/klikklaar-icon.jpeg'; // brand icon

type NavVisibility = 'all' | 'admin' | 'coach+admin';

interface NavItem {
  to: string;
  icon: any;
  label: string;
  visibility?: NavVisibility; // default: 'all' (everyone sees it)
}

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sales-executives', icon: Users, label: 'Sales Executives', visibility: 'coach+admin' },
  { to: '/sales-executives/new', icon: UserPlus, label: 'Nieuwe SE', visibility: 'admin' },
  { to: '/provisioning', icon: Package, label: 'Provisioning', visibility: 'admin' },
  { to: '/artifacts', icon: FileJson, label: 'Artifacts', visibility: 'admin' },
  { to: '/leads', icon: Target, label: 'Mijn Leads' },
  { to: '/pipedrive', icon: GitBranch, label: 'Pipedrive' },
  { to: '/calls', icon: Phone, label: 'Call Logging' },
  { to: '/integrations', icon: Plug, label: 'Integraties', visibility: 'admin' },
  { to: '/training', icon: GraduationCap, label: 'Training' },
  { to: '/eod', icon: ClipboardCheck, label: 'EOD Beheer' },
  { to: '/evaluaties', icon: ListChecks, label: 'Evaluaties', visibility: 'admin' },
  { to: '/settings', icon: Settings, label: 'Instellingen', visibility: 'admin' },
  { to: '/audit-logs', icon: ScrollText, label: 'Audit Logs', visibility: 'admin' },
];

interface AppSidebarProps {
  onCloseMobile?: () => void;
}

export function AppSidebar({ onCloseMobile }: AppSidebarProps) {
  const { signOut, user, isAdmin, roles } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <img src={klikklaarIcon} alt="KlikKlaar" className="h-9 w-9 rounded-lg" />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white tracking-tight">KlikKlaar<span className="text-purple-400">SEO</span></span>
                <span className="text-sm font-bold text-white tracking-tight">KlikKlaar<span className="text-emerald-400">WEB</span></span>
              </div>
            </div>
            <span className="text-[10px] font-semibold text-sidebar-accent-foreground tracking-widest uppercase">Control Center</span>
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
            <div className="flex items-center gap-3 mt-0.5">
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 text-[11px] text-sidebar-foreground/50 hover:text-sidebar-primary transition-colors"
              >
                <LogOut className="h-3 w-3" />
                Uitloggen
              </button>
              <button
                onClick={toggleTheme}
                className="flex items-center gap-1.5 text-[11px] text-sidebar-foreground/50 hover:text-sidebar-primary transition-colors"
                aria-label="Wissel thema"
              >
                {theme === 'light' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                {theme === 'light' ? 'Dark' : 'Light'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
