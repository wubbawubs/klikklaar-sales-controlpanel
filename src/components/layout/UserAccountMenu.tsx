import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, RefreshCw, KeyRound, Camera, Sun, Moon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useTheme } from '@/hooks/useTheme';
import { toast } from 'sonner';

export function UserAccountMenu() {
  const { user, signOut } = useAuth();
  const { profile, uploadAvatar } = useProfile();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const initials = (profile?.full_name || user?.email || '?')
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('');

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Bestand is te groot (max 2MB)');
      return;
    }
    setUploading(true);
    try {
      await uploadAvatar(file);
      toast.success('Profielfoto bijgewerkt');
    } catch (err: any) {
      toast.error(err.message || 'Upload mislukt');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const handlePasswordChange = async () => {
    try {
      const { error } = await (await import('@/integrations/supabase/client')).supabase.auth.resetPasswordForEmail(
        user?.email || '',
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      if (error) throw error;
      toast.success('Wachtwoord reset e-mail verzonden');
    } catch (err: any) {
      toast.error(err.message || 'Kon geen reset e-mail versturen');
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handlePhotoChange}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded-full ring-2 ring-border hover:ring-primary transition-all focus:outline-none focus:ring-primary"
            aria-label="Account menu"
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={profile?.avatar_url || undefined} alt="Profielfoto" />
              <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-medium leading-none">{profile?.full_name || 'Gebruiker'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/account')}>
            <Settings className="mr-2 h-4 w-4" />
            Account instellingen
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Camera className="mr-2 h-4 w-4" />
            {uploading ? 'Uploaden...' : 'Profielfoto wijzigen'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePasswordChange}>
            <KeyRound className="mr-2 h-4 w-4" />
            Wachtwoord wijzigen
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggleTheme}>
            {theme === 'light' ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Vernieuwen
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Uitloggen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
