import { useState, useCallback, useRef, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import { MotivationalSplash } from "@/components/auth/MotivationalSplash";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import SalesExecutivesPage from "@/pages/SalesExecutivesPage";
import NewSalesExecutivePage from "@/pages/NewSalesExecutivePage";
import SalesExecutiveDetailPage from "@/pages/SalesExecutiveDetailPage";

import IntegrationsPage from "@/pages/IntegrationsPage";
import EodPage from "@/pages/EodPage";
import SettingsPage from "@/pages/SettingsPage";
import LeadManagementPage from "@/pages/LeadManagementPage";
import NotFound from "@/pages/NotFound";
import AccountPage from "@/pages/AccountPage";
import NotificationsPage from "@/pages/NotificationsPage";
import PublicFormPage from "@/pages/public/PublicFormPage";
import { IOSInstallPrompt } from "@/components/pwa/IOSInstallPrompt";
import FormSuccessPage from "@/pages/public/FormSuccessPage";
import UnsubscribePage from "@/pages/UnsubscribePage";
import UserManagementPage from "@/pages/UserManagementPage";
import CloserCRMPage from "@/pages/CloserCRMPage";
import ForecastingPage from "@/pages/ForecastingPage";

const queryClient = new QueryClient();

const ADMIN_ROLES = ['super_admin', 'admin', 'coach'] as const;

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [showSplash, setShowSplash] = useState(false);
  const prevUser = useRef<typeof user>(undefined as any);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (loading) return;
    // Only show splash when transitioning from no-user to user (actual login)
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      prevUser.current = user;
      return;
    }
    if (!prevUser.current && user) {
      setShowSplash(true);
    }
    prevUser.current = user;
  }, [user, loading]);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  // Public routes - accessible without authentication
  if (location.pathname.startsWith('/form/')) {
    return (
      <Routes>
        <Route path="/form/:slug/success" element={<FormSuccessPage />} />
        <Route path="/form/:slug" element={<PublicFormPage />} />
      </Routes>
    );
  }

  if (location.pathname === '/reset-password') {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    );
  }

  if (location.pathname === '/unsubscribe') {
    return (
      <Routes>
        <Route path="/unsubscribe" element={<UnsubscribePage />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm font-medium">Laden...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (showSplash) return <MotivationalSplash onComplete={handleSplashComplete} />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* Accessible by all authenticated users */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/leads" element={<LeadManagementPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/account" element={<AccountPage />} />

        {/* Closer CRM */}
        <Route path="/closer" element={<ProtectedRoute allowedRoles={['closer', 'admin', 'super_admin']}><CloserCRMPage /></ProtectedRoute>} />

        {/* Redirects for old standalone routes */}
        <Route path="/calls" element={<LeadManagementPage />} />
        <Route path="/pipedrive" element={<LeadManagementPage />} />
        <Route path="/eod" element={<EodPage />} />
        <Route path="/audit-logs" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><SettingsPage /></ProtectedRoute>} />
        <Route path="/email-monitoring" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><SettingsPage /></ProtectedRoute>} />

        {/* Admin/Coach only routes */}
        <Route path="/sales-executives" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><SalesExecutivesPage /></ProtectedRoute>} />
        <Route path="/sales-executives/new" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><NewSalesExecutivePage /></ProtectedRoute>} />
        <Route path="/sales-executives/:id" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><SalesExecutiveDetailPage /></ProtectedRoute>} />
        <Route path="/sales-executives/:id/edit" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><NewSalesExecutivePage /></ProtectedRoute>} />
        <Route path="/provisioning" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><SalesExecutivesPage /></ProtectedRoute>} />
        <Route path="/integrations" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><IntegrationsPage /></ProtectedRoute>} />
        <Route path="/integraties" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><IntegrationsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><SettingsPage /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><UserManagementPage /></ProtectedRoute>} />
        <Route path="/forecasting" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><ForecastingPage /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <IOSInstallPrompt />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
