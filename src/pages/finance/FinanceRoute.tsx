import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useFinanceMe } from '@/hooks/useFinance';

export default function FinanceRoute({ children }: { children: ReactNode }) {
  const { data, isLoading } = useFinanceMe();
  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!data?.has_access) return <Navigate to="/" replace />;
  return <>{children}</>;
}
