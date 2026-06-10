import type { Tables } from '@/integrations/supabase/types';

export type AppRole = 'super_admin' | 'admin' | 'coach';

export type Profile = Tables<'profiles'>;
