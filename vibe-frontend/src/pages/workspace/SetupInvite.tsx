import { useCallback, useState } from 'react';
import { Plus, Trash2, Mail, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { InviteSetupData, WorkspaceMemberRole } from '@/types/workspace';

interface SetupInviteProps {
  invites: InviteSetupData[];
  onChange: (invites: InviteSetupData[]) => void;
}

const ROLE_OPTIONS: { value: WorkspaceMemberRole; label: string; description: string }[] = [
  { value: 'member', label: 'Member', description: 'Can view and edit content' },
  { value: 'admin', label: 'Admin', description: 'Can manage team members' },
];

export function SetupInvite({ invites, onChange }: SetupInviteProps) {
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<WorkspaceMemberRole>('member');

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const addInvite = useCallback(() => {
    if (!newEmail.trim() || !isValidEmail(newEmail)) return;

    // Check for duplicates
    if (invites.some((inv) => inv.email.toLowerCase() === newEmail.toLowerCase())) {
      return;
    }

    const newInvite: InviteSetupData = {
      id: crypto.randomUUID(),
      email: newEmail.trim().toLowerCase(),
      role: newRole,
    };

    onChange([...invites, newInvite]);
    setNewEmail('');
    setNewRole('member');
  }, [newEmail, newRole, invites, onChange]);

  const removeInvite = useCallback(
    (id: string) => {
      onChange(invites.filter((i) => i.id !== id));
    },
    [invites, onChange]
  );

  const updateInvite = useCallback(
    (id: string, updates: Partial<InviteSetupData>) => {
      onChange(
        invites.map((i) =>
          i.id === id ? { ...i, ...updates } : i
        )
      );
    },
    [invites, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addInvite();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Invite Team Members
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Invite colleagues to collaborate in your workspace.
        </p>
      </div>

      {/* Add new invite */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="email"
            placeholder="colleague@company.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10"
          />
        </div>
        <Select
          value={newRole}
          onValueChange={(value) => setNewRole(value as WorkspaceMemberRole)}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((role) => (
              <SelectItem key={role.value} value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={addInvite}
          disabled={!newEmail.trim() || !isValidEmail(newEmail)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add
        </Button>
      </div>

      {/* Invite list */}
      {invites.length > 0 ? (
        <div className="space-y-2">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center gap-3 p-3 border rounded-lg bg-card"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-muted-foreground">
                <Mail className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{invite.email}</p>
              </div>
              <Select
                value={invite.role}
                onValueChange={(value) =>
                  updateInvite(invite.id, { role: value as WorkspaceMemberRole })
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeInvite(invite.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
          <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>No invites yet</p>
          <p className="text-sm">Invite team members to collaborate</p>
        </div>
      )}

      {/* Role descriptions */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
        <p className="text-sm font-medium">Role Permissions</p>
        {ROLE_OPTIONS.map((role) => (
          <div key={role.value} className="text-sm">
            <span className="font-medium">{role.label}:</span>{' '}
            <span className="text-muted-foreground">{role.description}</span>
          </div>
        ))}
      </div>

      {/* Skip hint */}
      <p className="text-sm text-muted-foreground text-center">
        This step is optional. You can invite members later from workspace settings.
      </p>
    </div>
  );
}
