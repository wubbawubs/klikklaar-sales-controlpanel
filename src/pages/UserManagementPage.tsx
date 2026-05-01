import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Users, Shield, ShieldCheck, GraduationCap, Briefcase, Handshake, Plus, Trash2 } from 'lucide-react';
import type { AppRole } from '@/types/database';

interface UserWithRoles {
  user_id: string;
  full_name: string | null;
  email: string | null;
  active: boolean | null;
  roles: AppRole[];
}

const ROLE_CONFIG: Record<AppRole, { label: string; color: string; icon: typeof Shield }> = {
  super_admin: { label: 'Super Admin', color: 'bg-red-500/10 text-red-700 border-red-200', icon: ShieldCheck },
  admin: { label: 'Admin', color: 'bg-orange-500/10 text-orange-700 border-orange-200', icon: Shield },
  coach: { label: 'Coach', color: 'bg-blue-500/10 text-blue-700 border-blue-200', icon: GraduationCap },
  sales_executive: { label: 'Sales Executive', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-200', icon: Briefcase },
  closer: { label: 'Closer', color: 'bg-purple-500/10 text-purple-700 border-purple-200', icon: Handshake },
};

const ALL_ROLES: AppRole[] = ['super_admin', 'admin', 'coach', 'sales_executive', 'closer'];

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingRole, setAddingRole] = useState<string | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<AppRole | ''>('');

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, email, active');
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');

    if (profiles) {
      const roleMap = new Map<string, AppRole[]>();
      roles?.forEach(r => {
        const existing = roleMap.get(r.user_id) || [];
        existing.push(r.role as AppRole);
        roleMap.set(r.user_id, existing);
      });

      const merged: UserWithRoles[] = profiles.map(p => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        active: p.active,
        roles: roleMap.get(p.user_id) || [],
      }));

      merged.sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));
      setUsers(merged);
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const addRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Rol toegevoegd');
      setAddingRole(null);
      setSelectedNewRole('');
      fetchUsers();
    }
  };

  const removeRole = async (userId: string, role: AppRole) => {
    if (userId === currentUser?.id && role === 'super_admin') {
      toast.error('Je kunt je eigen super_admin rol niet verwijderen');
      return;
    }
    const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Rol verwijderd');
      fetchUsers();
    }
  };

  const availableRoles = (user: UserWithRoles) => ALL_ROLES.filter(r => !user.roles.includes(r));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gebruikersbeheer</h1>
        <p className="text-muted-foreground text-sm mt-1">Beheer gebruikers en hun rollen</p>
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
                    <TableHead>Status</TableHead>
                    <TableHead>Rollen</TableHead>
                    <TableHead className="w-[200px]">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.active !== false ? 'default' : 'secondary'} className="text-xs">
                          {u.active !== false ? 'Actief' : 'Inactief'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {u.roles.length === 0 && (
                            <span className="text-xs text-muted-foreground italic">Geen rollen</span>
                          )}
                          {u.roles.map(role => {
                            const cfg = ROLE_CONFIG[role];
                            return (
                              <div key={role} className="flex items-center gap-1">
                                <Badge variant="outline" className={`text-xs ${cfg.color}`}>
                                  {cfg.label}
                                </Badge>
                                <button
                                  onClick={() => removeRole(u.user_id, role)}
                                  className="text-muted-foreground/50 hover:text-destructive transition-colors"
                                  title={`Verwijder ${cfg.label} rol`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        {addingRole === u.user_id ? (
                          <div className="flex items-center gap-2">
                            <Select value={selectedNewRole} onValueChange={(v) => setSelectedNewRole(v as AppRole)}>
                              <SelectTrigger className="h-8 w-[140px] text-xs">
                                <SelectValue placeholder="Kies rol..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableRoles(u).map(r => (
                                  <SelectItem key={r} value={r}>{ROLE_CONFIG[r].label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              variant="default"
                              className="h-8 text-xs"
                              disabled={!selectedNewRole}
                              onClick={() => selectedNewRole && addRole(u.user_id, selectedNewRole)}
                            >
                              Toevoegen
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              onClick={() => { setAddingRole(null); setSelectedNewRole(''); }}
                            >
                              Annuleren
                            </Button>
                          </div>
                        ) : (
                          availableRoles(u).length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => { setAddingRole(u.user_id); setSelectedNewRole(''); }}
                            >
                              <Plus className="h-3 w-3" />
                              Rol toevoegen
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
