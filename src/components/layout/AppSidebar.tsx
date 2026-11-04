import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, KanbanSquare, Users, Layout, Settings, LogOut, Sun, Moon, UserCog, TrendingUp, Upload, Euro, CalendarDays, FileText, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BrandSwitcher } from '@/components/layout/BrandSwitcher';
import { useOrganization } from '@/hooks/useOrganization';
import { useFunnels } from '@/hooks/useFunnels';
import { useDeals } from '@/hooks/usePipeline';
import { cn } from '@/lib/utils';

interface NavItem { to: string; icon: any; label: string; adminOnly?: boolean }

const TOP_NAV: NavItem[] = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agenda',   icon: CalendarDays,    label: 'Agenda' },
];

const RELATIES_NAV: NavItem[] = [
  { to: '/contacts', icon: Users,           label: 'Contacten' },
  { to: '/meetings', icon: FileText,        label: 'Meetings' },
  { to: '/prullenbak', icon: Trash2,        label: 'Prullenbak' },
];

const NAV: NavItem[] = [
  { to: '/boards',   icon: Layout,          label: 'Boards' },
  { to: '/growth',   icon: TrendingUp,      label: 'Groeidoelen', adminOnly: true },
  { to: '/finance',  icon: Euro,            label: 'Finance', adminOnly: true },
];

const BOTTOM_NAV: NavItem[] = [
  { to: '/import',   icon: Upload,   label: 'Importeren', adminOnly: true },
  { to: '/users',    icon: UserCog,  label: 'Gebruikers', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Instellingen', adminOnly: true },
];

const ACTIVE = 'bg-white/70 dark:bg-white/10 text-sidebar-accent-foreground shadow-sm';
const IDLE = 'text-sidebar-foreground/70 hover:bg-white/40 dark:hover:bg-white/5 hover:text-sidebar-foreground';
const itemCls = (collapsed: boolean) =>
  cn('flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors', collapsed && 'justify-center');

function GroupLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="h-2" />;
  return <div className="px-2.5 pt-3 pb-1 text-[11px] font-semibold text-sidebar-foreground/50">{children}</div>;
}

function FunnelLink({ id, name, collapsed, onClick }: { id: string; name: string; collapsed: boolean; onClick?: () => void }) {
  const { data: deals } = useDeals(id);
  const to = `/pipeline/${id}`;
  // Radix Slot (TooltipTrigger asChild) drops a function className, so resolve the active state here.
  const isActive = useLocation().pathname === to;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          onClick={onClick}
          aria-current={isActive ? 'page' : undefined}
          className={cn(itemCls(collapsed), isActive ? ACTIVE : IDLE)}
        >
          <KanbanSquare className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="flex-1 truncate">{name}</span>}
          {!collapsed && deals && <span className="text-[11px] tabular-nums text-sidebar-foreground/50">{deals.length}</span>}
        </NavLink>
      </TooltipTrigger>
      {collapsed && <TooltipContent side="right">{name}</TooltipContent>}
    </Tooltip>
  );
}

interface AppSidebarProps { onCloseMobile?: () => void; collapsed?: boolean }

export function AppSidebar({ onCloseMobile, collapsed = false }: AppSidebarProps) {
  const { signOut, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const { isAllView } = useOrganization();
  const { data: funnels = [] } = useFunnels();

  const isActive = (to: string) => to === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(to);

  const renderItem = (item: NavItem) => (
    <Tooltip key={item.to}>
      <TooltipTrigger asChild>
        <NavLink
          to={item.to}
          onClick={onCloseMobile}
          className={cn(itemCls(collapsed), isActive(item.to) ? ACTIVE : IDLE)}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{item.label}</span>}
        </NavLink>
      </TooltipTrigger>
      {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full glass py-3 gap-1 overflow-y-auto">

        {/* Brand switcher */}
        <div className="px-2 mb-2">
          <BrandSwitcher collapsed={collapsed} />
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 px-2">
          {TOP_NAV.map(renderItem)}

          {!isAllView && funnels.length > 0 && (
            <>
              <GroupLabel collapsed={collapsed}>Funnels</GroupLabel>
              {funnels.map(f => (
                <FunnelLink key={f.id} id={f.id} name={f.name} collapsed={collapsed} onClick={onCloseMobile} />
              ))}
            </>
          )}

          <GroupLabel collapsed={collapsed}>Relaties</GroupLabel>
          {RELATIES_NAV.map(renderItem)}

          <GroupLabel collapsed={collapsed}>&nbsp;</GroupLabel>
          {NAV.filter(i => !i.adminOnly || isAdmin).map(renderItem)}
        </nav>

        {/* Bottom nav */}
        <div className="px-2 flex flex-col gap-0.5 border-t border-white/40 dark:border-sidebar-border pt-2 mt-1">
          {BOTTOM_NAV.filter(i => !i.adminOnly || isAdmin).map(item => (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.to}
                  onClick={onCloseMobile}
                  className={cn(
                    'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
                    collapsed ? 'justify-center' : '',
                    isActive(item.to)
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-sidebar-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">{item.label}</TooltipContent>}
            </Tooltip>
          ))}

          {/* Theme toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className={cn(
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors w-full text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-sidebar-foreground',
                  collapsed ? 'justify-center' : ''
                )}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                {!collapsed && <span>{theme === 'dark' ? 'Licht' : 'Donker'}</span>}
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Thema</TooltipContent>}
          </Tooltip>

          {/* Sign out */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className={cn(
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors w-full text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-sidebar-foreground',
                  collapsed ? 'justify-center' : ''
                )}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Uitloggen</span>}
              </button>
            </TooltipTrigger>
            {collapsed && <TooltipContent side="right">Uitloggen</TooltipContent>}
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
