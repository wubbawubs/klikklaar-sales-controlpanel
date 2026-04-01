import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Camera, KeyRound, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function AccountPage() {
  const { user } = useAuth();
  const { profile, loading, updateProfile, uploadAvatar } = useProfile();
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nameLoaded, setNameLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync name from profile once loaded
  if (profile && !nameLoaded) {
    setFullName(profile.full_name || '');
    setNameLoaded(true);
  }

  const initials = (profile?.full_name || user?.email || '?')
    .split(/[\s@]/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('');

  const handleSaveName = async () => {
    setSaving(true);
    try {
      await updateProfile({ full_name: fullName });
      toast.success('Naam bijgewerkt');
    } catch (err: any) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Max 2MB'); return; }
    setUploading(true);
    try {
      await uploadAvatar(file);
      toast.success('Profielfoto bijgewerkt');
    } catch (err: any) {
      toast.error(err.message || 'Upload mislukt');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handlePasswordReset = async () => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user?.email || '', {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('Wachtwoord reset e-mail verzonden naar ' + user?.email);
    } catch (err: any) {
      toast.error(err.message || 'Kon geen reset e-mail versturen');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account</h1>
        <p className="text-muted-foreground text-sm">Beheer je profiel en accountinstellingen</p>
      </div>

      {/* Profile photo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profielfoto</CardTitle>
          <CardDescription>Upload een foto (max 2MB, JPEG/PNG/WebP)</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <Avatar className="h-20 w-20">
            <AvatarImage src={profile?.avatar_url || undefined} alt="Profielfoto" />
            <AvatarFallback className="text-xl font-semibold bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handlePhotoUpload} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Camera className="mr-2 h-4 w-4" />
              {uploading ? 'Uploaden...' : 'Foto wijzigen'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Persoonlijke gegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" value={user?.email || ''} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Volledige naam</Label>
            <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Je naam" />
          </div>
          <Button onClick={handleSaveName} disabled={saving} size="sm">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Opslaan
          </Button>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Wachtwoord</CardTitle>
          <CardDescription>Ontvang een reset-link via e-mail om je wachtwoord te wijzigen</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={handlePasswordReset}>
            <KeyRound className="mr-2 h-4 w-4" />
            Wachtwoord wijzigen
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
