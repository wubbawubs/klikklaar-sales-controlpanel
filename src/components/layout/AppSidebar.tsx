import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, KanbanSquare, Users, Layout, Settings, LogOut, Sun, Moon, UserCog } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BrandSwitcher } from '@/components/layout/BrandSwitcher';
import { cn } from '@/lib/utils';

interface NavItem { to: string; icon: any; label: string; adminOnly?: boolean }

const NAV: NavItem[] = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pipeline', icon: KanbanSquare,    label: 'Pipeline' },
  { to: '/contacts', icon: Users,           label: 'Contacten' },
  { to: '/boards',   icon: Layout,          label: 'Boards' },
];

const BOTTOM_NAV: NavItem[] = [
  { to: '/users',    icon: UserCog,  label: 'Gebruikers', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Instellingen', adminOnly: true },
];

interface AppSidebarProps { onCloseMobile?: () => void; collapsed?: boolean }

export function AppSidebar({ onCloseMobile, collapsed = false }: AppSidebarProps) {
  const { signOut, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const isActive = (to: string) => to === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(to);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-full bg-sidebar py-3 gap-1">

        {/* Brand switcher */}
        <div className="px-2 mb-2">
          <BrandSwitcher collapsed={collapsed} />
        </div>

        {/* Main nav */}
        <nav className="flex-1 flex flex-col gap-0.5 px-2">
          {NAV.map(item => (
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
        </nav>

        {/* Bottom nav */}
        <div className="px-2 flex flex-col gap-0.5 border-t border-sidebar-border pt-2 mt-1">
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
