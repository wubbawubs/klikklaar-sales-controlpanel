import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { AppSidebar } from './AppSidebar';
import { Breadcrumbs } from './Breadcrumbs';
import { NotificationBell } from '@/components/pwa/NotificationBell';

const STORAGE_KEY = 'kk-sidebar-collapsed';

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (stored !== null) return stored === '1';
    // Default: collapsed on /leads (work-mode), expanded elsewhere
    return typeof window !== 'undefined' && window.location.pathname.startsWith('/leads');
  });

  // Persist
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Cmd/Ctrl+B shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setCollapsed(c => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 lg:static lg:z-auto
          transform transition-transform duration-200 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <AppSidebar onCloseMobile={() => setMobileOpen(false)} collapsed={collapsed} />
      </div>

      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Top bar */}
        <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur border-b border-border/60">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5 text-foreground" />
            </button>
            <button
              onClick={() => setCollapsed(c => !c)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors hidden lg:flex items-center gap-2 text-muted-foreground hover:text-foreground"
              aria-label={collapsed ? 'Sidebar uitklappen' : 'Sidebar inklappen'}
              title={`${collapsed ? 'Uitklappen' : 'Inklappen'} (⌘B)`}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              <span className="text-[11px] font-medium hidden xl:inline">⌘B</span>
            </button>
            <span className="text-sm font-semibold text-foreground lg:hidden">Control Center</span>
          </div>
          <UserAccountMenu />
        </div>

        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
          <Breadcrumbs />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
