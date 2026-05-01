import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileJson,
  Plug,
  GraduationCap,
  Settings,
  LogOut,
  ListChecks,
  Target,
  X,
  Sun,
  Moon,
  UserCog,
  Handshake,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import klikklaarIcon from '@/assets/klikklaar-icon.jpeg';

type NavVisibility = 'all' | 'admin' | 'coach+admin' | 'closer+admin';

interface NavItem {
  to: string;
  icon: any;
  label: string;
  visibility?: NavVisibility;
}

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/sales-executives', icon: Users, label: 'Sales Executives', visibility: 'coach+admin' },
  { to: '/artifacts', icon: FileJson, label: 'Exports', visibility: 'admin' },
  { to: '/leads', icon: Target, label: 'Leads & CRM' },
  { to: '/closer', icon: Handshake, label: 'Closer CRM', visibility: 'closer+admin' },
  { to: '/integraties', icon: Plug, label: 'Integraties', visibility: 'admin' },
  { to: '/training', icon: GraduationCap, label: 'Training' },
  { to: '/evaluaties', icon: ListChecks, label: 'Evaluaties', visibility: 'coach+admin' },
  { to: '/users', icon: UserCog, label: 'Gebruikers', visibility: 'admin' },
  { to: '/settings', icon: Settings, label: 'Instellingen', visibility: 'admin' },
];

interface AppSidebarProps {
  onCloseMobile?: () => void;
  collapsed?: boolean;
}

export function AppSidebar({ onCloseMobile, collapsed = false }: AppSidebarProps) {
  const { signOut, user, isAdmin, roles } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const isCoachOrAdmin = isAdmin || roles.includes('coach');
  const isCloserOrAdmin = isAdmin || roles.includes('closer');

  const visibleItems = navItems.filter(item => {
    if (!item.visibility) return true;
    if (item.visibility === 'admin') return isAdmin;
    if (item.visibility === 'coach+admin') return isCoachOrAdmin;
    if (item.visibility === 'closer+admin') return isCloserOrAdmin;
    return true;
  });

  const handleNavClick = () => {
    onCloseMobile?.();
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'flex flex-col h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-14' : 'w-64'
        )}
      >
        {/* Brand header */}
        <div className={cn('border-b border-sidebar-border', collapsed ? 'px-2 py-3' : 'px-6 py-5')}>
          <div className="flex items-center justify-between">
            {collapsed ? (
              <img src={klikklaarIcon} alt="KlikKlaar" className="h-9 w-9 rounded-lg mx-auto" />
            ) : (
              <>
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
                <button
                  onClick={onCloseMobile}
                  className="p-1 rounded-lg hover:bg-sidebar-accent transition-colors lg:hidden"
                  aria-label="Sluit menu"
                >
                  <X className="h-5 w-5 text-sidebar-foreground/70" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-1.5' : 'px-3')}>
          <div className="space-y-0.5">
            {visibleItems.map(({ to, icon: Icon, label }) => {
              const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
              const link = (
                <NavLink
                  key={to}
                  to={to}
                  onClick={handleNavClick}
                  className={cn(
                    'group relative flex items-center gap-3 text-sm rounded-lg transition-all duration-150',
                    collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
                    isActive
                      ? 'bg-sidebar-accent text-white font-medium'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                  )}
                >
                  {isActive && !collapsed && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-sidebar-primary" />
                  )}
                  <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-sidebar-primary')} strokeWidth={2} />
                  {!collapsed && label}
                </NavLink>
              );
              return collapsed ? (
                <Tooltip key={to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              ) : link;
            })}
          </div>
        </nav>

        {/* User footer */}
        <div className={cn('border-t border-sidebar-border', collapsed ? 'px-2 py-3' : 'px-4 py-4')}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleTheme}
                    className="p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-primary transition-colors"
                    aria-label="Wissel thema"
                  >
                    {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{theme === 'light' ? 'Dark' : 'Light'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={signOut}
                    className="p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-primary transition-colors"
                    aria-label="Uitloggen"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Uitloggen</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-accent-foreground uppercase shrink-0">
                {user?.email?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-sidebar-foreground/80 truncate">{user?.email}</p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
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
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
