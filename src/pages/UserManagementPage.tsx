import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Users, Shield, ShieldCheck, GraduationCap, Briefcase, Handshake, Plus, Trash2, Building2, UserPlus, Mail } from 'lucide-react';
import type { AppRole } from '@/types/database';

interface Org { id: string; name: string; slug: string }
interface Membership { organization_id: string; role: string }

interface UserWithRoles {
  user_id: string;
  full_name: string | null;
  email: string | null;
  active: boolean | null;
  roles: AppRole[];
  orgs: Membership[];
}

const ROLE_CONFIG: Record<AppRole, { label: string; color: string; icon: typeof Shield }> = {
  super_admin: { label: 'Super Admin', color: 'bg-red-500/10 text-red-700 border-red-200', icon: ShieldCheck },
  admin: { label: 'Admin', color: 'bg-orange-500/10 text-orange-700 border-orange-200', icon: Shield },
  coach: { label: 'Coach', color: 'bg-blue-500/10 text-blue-700 border-blue-200', icon: GraduationCap },
  sales_executive: { label: 'Sales Executive', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-200', icon: Briefcase },
  closer: { label: 'Closer', color: 'bg-purple-500/10 text-purple-700 border-purple-200', icon: Handshake },
};

const ALL_ROLES: AppRole[] = ['super_admin', 'admin', 'coach', 'sales_executive', 'closer'];
// Roles offered when inviting — super_admin is intentionally not invitable from the form.
const INVITE_ROLES: AppRole[] = ['admin', 'coach', 'sales_executive', 'closer'];

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingRole, setAddingRole] = useState<string | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<AppRole | ''>('');
  const [addingOrg, setAddingOrg] = useState<string | null>(null);
  const [selectedNewOrg, setSelectedNewOrg] = useState<string>('');

  // Invite form
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('sales_executive');
  const [inviteOrg, setInviteOrg] = useState('');
  const [inviting, setInviting] = useState(false);

  const orgName = (id: string) => orgs.find(o => o.id === id)?.name ?? 'Onbekend';

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: memberships }, { data: orgRows }] = await Promise.all([
      supabase.from('profiles').select('user_id, full_name, email, active'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('user_organizations').select('user_id, organization_id, role'),
      supabase.from('organizations').select('id, name, slug').order('name'),
    ]);

    setOrgs((orgRows ?? []) as Org[]);

    if (profiles) {
      const roleMap = new Map<string, AppRole[]>();
      roles?.forEach(r => {
        const e = roleMap.get(r.user_id) || [];
        e.push(r.role as AppRole);
        roleMap.set(r.user_id, e);
      });
      const orgMap = new Map<string, Membership[]>();
      memberships?.forEach(m => {
        const e = orgMap.get(m.user_id) || [];
        e.push({ organization_id: m.organization_id, role: m.role });
        orgMap.set(m.user_id, e);
      });

      const merged: UserWithRoles[] = profiles.map(p => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        active: p.active,
        roles: roleMap.get(p.user_id) || [],
        orgs: orgMap.get(p.user_id) || [],
      }));
      merged.sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));
      setUsers(merged);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim() || !inviteOrg) {
      toast.error('E-mail, naam en bedrijf zijn verplicht');
      return;
    }
    setInviting(true);
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email: inviteEmail.trim(), fullName: inviteName.trim(), role: inviteRole, organizationId: inviteOrg },
    });
    setInviting(false);
    if (error || (data && data.error)) {
      toast.error(error?.message || data?.error || 'Uitnodigen mislukt');
      return;
    }
    toast.success(
      data?.inviteEmailSent
        ? 'Uitnodiging verstuurd — de gebruiker krijgt een e-mail om een wachtwoord in te stellen'
        : 'Gebruiker aangemaakt (e-mail kon niet worden verstuurd — deel de reset-link handmatig)',
    );
    setInviteOpen(false);
    setInviteEmail(''); setInviteName(''); setInviteRole('sales_executive'); setInviteOrg('');
    fetchAll();
  };

  const addRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role });
    if (error) { toast.error(error.message); return; }
    toast.success('Rol toegevoegd');
    setAddingRole(null); setSelectedNewRole(''); fetchAll();
  };

  const removeRole = async (userId: string, role: AppRole) => {
    if (userId === currentUser?.id && role === 'super_admin') {
      toast.error('Je kunt je eigen super_admin rol niet verwijderen');
      return;
    }
    const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role);
    if (error) { toast.error(error.message); return; }
    toast.success('Rol verwijderd'); fetchAll();
  };

  const addOrg = async (userId: string, organizationId: string) => {
    const { error } = await supabase.from('user_organizations').insert({ user_id: userId, organization_id: organizationId, role: 'member' });
    if (error) { toast.error(error.message); return; }
    toast.success('Bedrijf gekoppeld — toegang tot die pipeline verleend');
    setAddingOrg(null); setSelectedNewOrg(''); fetchAll();
  };

  const removeOrg = async (userId: string, organizationId: string) => {
    const { error } = await supabase.from('user_organizations').delete().eq('user_id', userId).eq('organization_id', organizationId);
    if (error) { toast.error(error.message); return; }
    toast.success('Bedrijf ontkoppeld — pipeline-toegang ingetrokken'); fetchAll();
  };

  const availableRoles = (u: UserWithRoles) => ALL_ROLES.filter(r => !u.roles.includes(r));
  const availableOrgs = (u: UserWithRoles) => orgs.filter(o => !u.orgs.some(m => m.organization_id === o.id));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Gebruikersbeheer</h1>
          <p className="text-muted-foreground text-sm mt-1">Beheer gebruikers, rollen en bedrijfstoegang (pipeline)</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><UserPlus className="h-4 w-4" /> Gebruiker uitnodigen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Gebruiker uitnodigen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-name">Volledige naam</Label>
                <Input id="inv-name" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jan Jansen" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">E-mail</Label>
                <Input id="inv-email" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="jan@bedrijf.nl" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Rol</Label>
                  <Select value={inviteRole} onValueChange={v => setInviteRole(v as AppRole)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INVITE_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_CONFIG[r].label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Bedrijf</Label>
                  <Select value={inviteOrg} onValueChange={setInviteOrg}>
                    <SelectTrigger><SelectValue placeholder="Kies bedrijf..." /></SelectTrigger>
                    <SelectContent>
                      {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                De gebruiker krijgt een e-mail om een wachtwoord in te stellen. Het bedrijf bepaalt tot welke pipeline ze toegang hebben.
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setInviteOpen(false)}>Annuleren</Button>
              <Button onClick={sendInvite} disabled={inviting}>{inviting ? 'Versturen...' : 'Uitnodiging versturen'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ALL_ROLES.map(role => {
          const cfg = ROLE_CONFIG[role];
          const count = users.filter(u => u.roles.includes(role)).length;
          return (
            <Card key={role} className="border">
              <CardContent className="p-4 flex items-center gap-3">
                <cfg.icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold text-foreground">{count}</p>
                  <p className="text-xs text-muted-foreground">{cfg.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Alle gebruikers ({users.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Rollen</TableHead>
                    <TableHead>Bedrijven (pipeline-toegang)</TableHead>
                    <TableHead className="w-[180px]">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {u.roles.length === 0 && <span className="text-xs text-muted-foreground italic">Geen rollen</span>}
                          {u.roles.map(role => {
                            const cfg = ROLE_CONFIG[role];
                            return (
                              <div key={role} className="flex items-center gap-1">
                                <Badge variant="outline" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                                <button onClick={() => removeRole(u.user_id, role)} className="text-muted-foreground/50 hover:text-destructive transition-colors" title={`Verwijder ${cfg.label}`}>
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {u.orgs.length === 0 && <span className="text-xs text-muted-foreground italic">Geen bedrijf</span>}
                          {u.orgs.map(m => (
                            <div key={m.organization_id} className="flex items-center gap-1">
                              <Badge variant="outline" className="text-xs bg-primary/5 border-primary/20">
                                <Building2 className="h-3 w-3 mr-1" />{orgName(m.organization_id)}
                              </Badge>
                              <button onClick={() => removeOrg(u.user_id, m.organization_id)} className="text-muted-foreground/50 hover:text-destructive transition-colors" title="Ontkoppel bedrijf">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          {addingOrg === u.user_id ? (
                            <div className="flex items-center gap-1">
                              <Select value={selectedNewOrg} onValueChange={setSelectedNewOrg}>
                                <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue placeholder="Bedrijf..." /></SelectTrigger>
                                <SelectContent>
                                  {availableOrgs(u).map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <Button size="sm" className="h-7 text-xs" disabled={!selectedNewOrg} onClick={() => selectedNewOrg && addOrg(u.user_id, selectedNewOrg)}>OK</Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingOrg(null); setSelectedNewOrg(''); }}>×</Button>
                            </div>
                          ) : (
                            availableOrgs(u).length > 0 && (
                              <button onClick={() => { setAddingOrg(u.user_id); setSelectedNewOrg(''); }} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                                <Plus className="h-3 w-3" /> bedrijf
                              </button>
                            )
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {addingRole === u.user_id ? (
                          <div className="flex items-center gap-2">
                            <Select value={selectedNewRole} onValueChange={(v) => setSelectedNewRole(v as AppRole)}>
                              <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Kies rol..." /></SelectTrigger>
                              <SelectContent>
                                {availableRoles(u).map(r => <SelectItem key={r} value={r}>{ROLE_CONFIG[r].label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Button size="sm" className="h-8 text-xs" disabled={!selectedNewRole} onClick={() => selectedNewRole && addRole(u.user_id, selectedNewRole)}>OK</Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setAddingRole(null); setSelectedNewRole(''); }}>×</Button>
                          </div>
                        ) : (
                          availableRoles(u).length > 0 && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setAddingRole(u.user_id); setSelectedNewRole(''); }}>
                              <Plus className="h-3 w-3" /> Rol
                            </Button>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
