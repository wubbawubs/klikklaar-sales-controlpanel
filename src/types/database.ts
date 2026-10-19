import type { Tables } from '@/integrations/supabase/types';

// Mirrors the DB enum `app_role` (see integrations/supabase/types.ts).
export type AppRole = 'super_admin' | 'admin' | 'coach' | 'sales_executive' | 'closer';

export type Profile = Tables<'profiles'>;
