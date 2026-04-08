import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  active: boolean | null;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setProfile(data as unknown as UserProfile | null);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const updateProfile = async (updates: Partial<Pick<UserProfile, 'full_name' | 'avatar_url'>>) => {
    if (!user) return;
    // Only send full_name to DB (avatar_url not in profiles schema)
    const dbUpdates: { full_name?: string | null } = {};
    if (updates.full_name !== undefined) dbUpdates.full_name = updates.full_name;
    if (Object.keys(dbUpdates).length > 0) {
      const { error } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('user_id', user.id);
      if (error) throw error;
    }
    // Store avatar_url in user metadata
    if (updates.avatar_url !== undefined) {
      await supabase.auth.updateUser({ data: { avatar_url: updates.avatar_url } });
    }
    await fetchProfile();
  };

  const uploadAvatar = async (file: File): Promise<string> => {
    if (!user) throw new Error('Not authenticated');
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;
    
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(path);

    // Add cache buster
    const url = `${publicUrl}?t=${Date.now()}`;
    await updateProfile({ avatar_url: url });
    return url;
  };

  return { profile, loading, updateProfile, uploadAvatar, refetch: fetchProfile };
}
