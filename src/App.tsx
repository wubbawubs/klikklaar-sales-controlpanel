import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { OrganizationProvider } from "@/hooks/useOrganization";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import PipelinePage from "@/pages/PipelinePage";
import ContactsPage from "@/pages/ContactsPage";
import BoardsPage from "@/pages/BoardsPage";
import BoardPage from "@/pages/BoardPage";
import GrowthPage from "@/pages/GrowthPage";
import FinanceLayout from "@/pages/finance/FinanceLayout";
import FinancePage from "@/pages/FinancePage";
import FacturenPage from "@/pages/FacturenPage";
import OmzetResultaatPage from "@/pages/OmzetResultaatPage";
import LiquiditeitPage from "@/pages/LiquiditeitPage";
import ContractenPage from "@/pages/ContractenPage";
import StripePage from "@/pages/StripePage";
import ImportPage from "@/pages/ImportPage";
import SettingsPage from "@/pages/SettingsPage";
import UserManagementPage from "@/pages/UserManagementPage";
import AccountPage from "@/pages/AccountPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (location.pathname === '/reset-password') {
    return <Routes><Route path="/reset-password" element={<ResetPasswordPage />} /></Routes>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/boards" element={<BoardsPage />} />
        <Route path="/boards/:id" element={<BoardPage />} />
        <Route path="/growth" element={<GrowthPage />} />
        <Route path="/finance" element={<FinanceLayout />}>
          <Route index element={<FinancePage />} />
          <Route path="facturen" element={<FacturenPage />} />
          <Route path="omzet" element={<OmzetResultaatPage />} />
          <Route path="liquiditeit" element={<LiquiditeitPage />} />
          <Route path="contracten" element={<ContractenPage />} />
          <Route path="stripe" element={<StripePage />} />
        </Route>
        <Route path="/account" element={<AccountPage />} />
        <Route path="/settings" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><SettingsPage /></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><UserManagementPage /></ProtectedRoute>} />
        <Route path="/import" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><ImportPage /></ProtectedRoute>} />
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
          <OrganizationProvider>
            <AppRoutes />
          </OrganizationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
