import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import SalesExecutivesPage from "@/pages/SalesExecutivesPage";
import NewSalesExecutivePage from "@/pages/NewSalesExecutivePage";
import SalesExecutiveDetailPage from "@/pages/SalesExecutiveDetailPage";
import ProvisioningPage from "@/pages/ProvisioningPage";
import ArtifactsPage from "@/pages/ArtifactsPage";
import IntegrationsPage from "@/pages/IntegrationsPage";
import TrainingPage from "@/pages/TrainingPage";
import EodPage from "@/pages/EodPage";
import SettingsPage from "@/pages/SettingsPage";
import AuditLogsPage from "@/pages/AuditLogsPage";
import LeadManagementPage from "@/pages/LeadManagementPage";
import CallLoggingPage from "@/pages/CallLoggingPage";
import NotFound from "@/pages/NotFound";
import AccountPage from "@/pages/AccountPage";
import PipedrivePage from "@/pages/PipedrivePage";
import NotificationsPage from "@/pages/NotificationsPage";
import PublicFormPage from "@/pages/public/PublicFormPage";
import { IOSInstallPrompt } from "@/components/pwa/IOSInstallPrompt";
import FormSuccessPage from "@/pages/public/FormSuccessPage";
import UnsubscribePage from "@/pages/UnsubscribePage";
import EvaluatiesDashboard from "@/pages/evaluaties/EvaluatiesDashboard";
import FormulierenPage from "@/pages/evaluaties/FormulierenPage";
import FormulierDetailPage from "@/pages/evaluaties/FormulierDetailPage";
import ResponsesPage from "@/pages/evaluaties/ResponsesPage";
import AnalyticsPage from "@/pages/evaluaties/AnalyticsPage";

const queryClient = new QueryClient();

const ADMIN_ROLES = ['super_admin', 'admin', 'coach'] as const;

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

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

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* Accessible by all authenticated users */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/leads" element={<LeadManagementPage />} />
        <Route path="/calls" element={<CallLoggingPage />} />
        <Route path="/pipedrive" element={<PipedrivePage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/eod" element={<EodPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/account" element={<AccountPage />} />

        {/* Admin/Coach only routes */}
        <Route path="/sales-executives" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><SalesExecutivesPage /></ProtectedRoute>} />
        <Route path="/sales-executives/new" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><NewSalesExecutivePage /></ProtectedRoute>} />
        <Route path="/sales-executives/:id" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><SalesExecutiveDetailPage /></ProtectedRoute>} />
        <Route path="/sales-executives/:id/edit" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><NewSalesExecutivePage /></ProtectedRoute>} />
        <Route path="/provisioning" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><ProvisioningPage /></ProtectedRoute>} />
        <Route path="/artifacts" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><ArtifactsPage /></ProtectedRoute>} />
        <Route path="/integrations" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><IntegrationsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><SettingsPage /></ProtectedRoute>} />
        <Route path="/audit-logs" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><AuditLogsPage /></ProtectedRoute>} />
        <Route path="/evaluaties" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><EvaluatiesDashboard /></ProtectedRoute>} />
        <Route path="/evaluaties/formulieren" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><FormulierenPage /></ProtectedRoute>} />
        <Route path="/evaluaties/formulieren/:id" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><FormulierDetailPage /></ProtectedRoute>} />
        <Route path="/evaluaties/responses" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><ResponsesPage /></ProtectedRoute>} />
        <Route path="/evaluaties/analytics" element={<ProtectedRoute allowedRoles={[...ADMIN_ROLES]}><AnalyticsPage /></ProtectedRoute>} />
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
