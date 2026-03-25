import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import LoginPage from "@/pages/LoginPage";
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
import NotFound from "@/pages/NotFound";
import PublicFormPage from "@/pages/public/PublicFormPage";
import FormSuccessPage from "@/pages/public/FormSuccessPage";
import EvaluatiesDashboard from "@/pages/evaluaties/EvaluatiesDashboard";
import FormulierenPage from "@/pages/evaluaties/FormulierenPage";
import FormulierDetailPage from "@/pages/evaluaties/FormulierDetailPage";
import ResponsesPage from "@/pages/evaluaties/ResponsesPage";
import AnalyticsPage from "@/pages/evaluaties/AnalyticsPage";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Public form routes - accessible without authentication
  if (location.pathname.startsWith('/form/')) {
    return (
      <Routes>
        <Route path="/form/:slug/success" element={<FormSuccessPage />} />
        <Route path="/form/:slug" element={<PublicFormPage />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Laden...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/sales-executives" element={<SalesExecutivesPage />} />
        <Route path="/sales-executives/new" element={<NewSalesExecutivePage />} />
        <Route path="/sales-executives/:id" element={<SalesExecutiveDetailPage />} />
        <Route path="/sales-executives/:id/edit" element={<NewSalesExecutivePage />} />
        <Route path="/provisioning" element={<ProvisioningPage />} />
        <Route path="/artifacts" element={<ArtifactsPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/eod" element={<EodPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
        <Route path="/evaluaties" element={<EvaluatiesDashboard />} />
        <Route path="/evaluaties/formulieren" element={<FormulierenPage />} />
        <Route path="/evaluaties/formulieren/:id" element={<FormulierDetailPage />} />
        <Route path="/evaluaties/responses" element={<ResponsesPage />} />
        <Route path="/evaluaties/analytics" element={<AnalyticsPage />} />
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
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
