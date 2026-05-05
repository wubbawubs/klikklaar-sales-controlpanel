import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Plug,
  Settings,
  LogOut,
  Target,
  X,
  Sun,
  Moon,
  UserCog,
  Handshake,
  Shield,
  ChevronDown,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useTheme } from '@/hooks/useTheme';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BrandSwitcher } from '@/components/layout/BrandSwitcher';
import { cn } from '@/lib/utils';
import klikklaarIcon from '@/assets/klikklaar-icon.jpeg';

type NavVisibility = 'all' | 'admin' | 'coach+admin' | 'closer+admin';

interface NavItem {
  to: string;
  icon: any;
  label: string;
  visibility?: NavVisibility;
}

interface NavGroup {
  label: string;
  icon: any;
  visibility?: NavVisibility;
  items: NavItem[];
}

const topItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', icon: Target, label: 'Leads & CRM' },
  { to: '/closer', icon: Handshake, label: 'Closer CRM', visibility: 'closer+admin' },
  { to: '/forecasting', icon: TrendingUp, label: 'Forecasting', visibility: 'admin' },
];

const beheerGroup: NavGroup = {
  label: 'Beheer',
  icon: Shield,
  visibility: 'admin',
  items: [
    { to: '/sales-executives', icon: Users, label: 'Sales Executives', visibility: 'coach+admin' },
    { to: '/users', icon: UserCog, label: 'Gebruikers', visibility: 'admin' },
    { to: '/integraties', icon: Plug, label: 'Integraties', visibility: 'admin' },
    { to: '/settings', icon: Settings, label: 'Instellingen', visibility: 'admin' },
  ],
};

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

  const isVisible = (vis?: NavVisibility) => {
    if (!vis) return true;
    if (vis === 'admin') return isAdmin;
    if (vis === 'coach+admin') return isCoachOrAdmin;
    if (vis === 'closer+admin') return isCloserOrAdmin;
    return true;
  };

  const visibleTop = topItems.filter(i => isVisible(i.visibility));
  const visibleBeheer = beheerGroup.items.filter(i => isVisible(i.visibility));
  const showBeheer = isVisible(beheerGroup.visibility) && visibleBeheer.length > 0;
  const beheerActive = visibleBeheer.some(i => location.pathname.startsWith(i.to));
  const [beheerOpen, setBeheerOpen] = useState(beheerActive);

  const handleNavClick = () => {
    onCloseMobile?.();
  };

  const renderItem = ({ to, icon: Icon, label }: NavItem, indent = false) => {
    const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
    const link = (
      <NavLink
        key={to}
        to={to}
        onClick={handleNavClick}
        className={cn(
          'group relative flex items-center gap-3 text-sm rounded-lg transition-all duration-150',
          collapsed ? 'justify-center px-0 py-2.5' : cn('px-3 py-2', indent && 'pl-9'),
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm'
            : 'text-sidebar-foreground/75 hover:bg-sidebar-hover hover:text-white'
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
                  <span className="text-[10px] font-semibold text-sidebar-foreground/60 tracking-widest uppercase">Control Center</span>
                </div>
                <button
                  onClick={onCloseMobile}
                  className="p-1 rounded-lg hover:bg-sidebar-hover transition-colors lg:hidden"
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
            {visibleTop.map(item => renderItem(item))}

            {showBeheer && (
              <div className="pt-2">
                {collapsed ? (
                  <>
                    <div className="my-2 mx-2 border-t border-sidebar-border/40" />
                    {visibleBeheer.map(item => renderItem(item))}
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setBeheerOpen(o => !o)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider rounded-lg transition-colors',
                        'text-sidebar-foreground/50 hover:text-sidebar-foreground/80'
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <beheerGroup.icon className="h-3.5 w-3.5" />
                        {beheerGroup.label}
                      </span>
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', beheerOpen && 'rotate-180')} />
                    </button>
                    {beheerOpen && (
                      <div className="mt-0.5 space-y-0.5">
                        {visibleBeheer.map(item => renderItem(item, true))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
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
                    className="p-2 rounded-lg hover:bg-sidebar-hover text-sidebar-foreground/70 hover:text-sidebar-primary transition-colors"
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
                    className="p-2 rounded-lg hover:bg-sidebar-hover text-sidebar-foreground/70 hover:text-sidebar-primary transition-colors"
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
              <div className="h-8 w-8 rounded-full bg-sidebar-primary/15 flex items-center justify-center text-xs font-semibold text-sidebar-primary uppercase shrink-0 ring-1 ring-sidebar-primary/20">
                {user?.email?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground/90 truncate">{user?.email}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleTheme}
                      className="p-1.5 rounded-md text-sidebar-foreground/60 hover:text-sidebar-primary hover:bg-sidebar-hover transition-colors"
                      aria-label="Wissel thema"
                    >
                      {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{theme === 'light' ? 'Dark mode' : 'Light mode'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={signOut}
                      className="p-1.5 rounded-md text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-hover transition-colors"
                      aria-label="Uitloggen"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Uitloggen</TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
