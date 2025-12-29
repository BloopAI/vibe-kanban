import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Lock } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useTeams } from '@/hooks/useTeams';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import type { Team } from 'shared/types';

export interface TeamFormDialogProps {
  editTeam?: Team;
}

export type TeamFormDialogResult = 'saved' | 'canceled' | 'deleted';

// Common timezones
const TIMEZONES = [
  { value: 'UTC', label: '(UTC+00:00) UTC' },
  { value: 'America/New_York', label: '(UTC-05:00) Eastern Time' },
  { value: 'America/Chicago', label: '(UTC-06:00) Central Time' },
  { value: 'America/Denver', label: '(UTC-07:00) Mountain Time' },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) Pacific Time' },
  { value: 'Europe/London', label: '(UTC+00:00) London' },
  { value: 'Europe/Paris', label: '(UTC+01:00) Paris' },
  { value: 'Europe/Berlin', label: '(UTC+01:00) Berlin' },
  { value: 'Asia/Tokyo', label: '(UTC+09:00) Tokyo' },
  { value: 'Asia/Shanghai', label: '(UTC+08:00) Shanghai' },
  { value: 'Asia/Kolkata', label: '(UTC+05:30) India' },
  { value: 'Australia/Sydney', label: '(UTC+11:00) Sydney' },
];

// Generate identifier from team name (e.g., "Engineering" -> "ENG")
function generateIdentifier(name: string): string {
  if (!name.trim()) return '';

  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    // Single word: take first 3 characters
    return name.slice(0, 3).toUpperCase();
  }
  // Multiple words: take first letter of each word (up to 4)
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const TeamFormDialogImpl = NiceModal.create<TeamFormDialogProps>(({ editTeam }) => {
  const modal = useModal();
  const { createTeam, updateTeam, deleteTeam, teams } = useTeams();
  const isEditing = !!editTeam;

  const [name, setName] = useState(editTeam?.name || '');
  const [icon, setIcon] = useState<string | null>(editTeam?.icon || null);
  const [identifier, setIdentifier] = useState('');
  const [identifierManuallySet, setIdentifierManuallySet] = useState(false);
  const [parentTeamId, setParentTeamId] = useState<string>('none');
  const [timezone, setTimezone] = useState<string>('UTC');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate identifier from name (only for new teams)
  useEffect(() => {
    if (!identifierManuallySet && !isEditing) {
      setIdentifier(generateIdentifier(name));
    }
  }, [name, identifierManuallySet, isEditing]);

  const handleIdentifierChange = (value: string) => {
    setIdentifier(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
    setIdentifierManuallySet(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Team name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      if (isEditing && editTeam) {
        await updateTeam(editTeam.id, {
          name: name.trim(),
          icon: icon,
          color: editTeam.color
        });
      } else {
        await createTeam({
          name: name.trim(),
          icon: icon,
          color: null
        });
      }
      modal.resolve('saved' as TeamFormDialogResult);
      modal.hide();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditing ? 'Failed to update team' : 'Failed to create team');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editTeam) return;

    try {
      setIsDeleting(true);
      setError(null);
      await deleteTeam(editTeam.id);
      modal.resolve('deleted' as TeamFormDialogResult);
      modal.hide();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      modal.resolve('canceled' as TeamFormDialogResult);
      modal.hide();
    }
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit team' : 'Create team'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update your team settings and information.'
                : 'Create a new team to organize your projects and collaborate with members.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-5">
            {/* Team Icon and Name Row */}
            <div className="flex gap-4">
              <div className="space-y-2">
                <Label>Team icon</Label>
                <EmojiPicker value={icon} onChange={setIcon} />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="team-name">Team name</Label>
                <Input
                  id="team-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Engineering"
                  autoFocus
                  disabled={isSubmitting}
                  className="h-10"
                />
              </div>
            </div>

            {/* Identifier */}
            <div className="space-y-2">
              <Label htmlFor="identifier">
                Identifier
                <span className="ml-1 text-xs text-muted-foreground">
                  (used for issue IDs, e.g., {identifier || 'ENG'}-123)
                </span>
              </Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(e) => handleIdentifierChange(e.target.value)}
                placeholder="ENG"
                disabled={isSubmitting}
                maxLength={6}
                className="h-10 w-32 font-mono uppercase"
              />
            </div>

            {/* Parent Team */}
            <div className="space-y-2">
              <Label htmlFor="parent-team">Parent team</Label>
              <Select value={parentTeamId} onValueChange={setParentTeamId} disabled={isSubmitting}>
                <SelectTrigger id="parent-team" className="h-10">
                  <SelectValue placeholder="No parent team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent team</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.icon && <span className="mr-2">{team.icon}</span>}
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone} disabled={isSubmitting}>
                <SelectTrigger id="timezone" className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Private Team Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <Label htmlFor="private-team" className="cursor-pointer">
                    Make team private
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Only team members can see private team issues
                  </p>
                </div>
              </div>
              <Switch
                id="private-team"
                checked={isPrivate}
                onCheckedChange={setIsPrivate}
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            <div>
              {isEditing && !showDeleteConfirm && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSubmitting || isDeleting}
                >
                  Delete team
                </Button>
              )}
              {showDeleteConfirm && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm delete'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting || isDeleting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isDeleting || !name.trim()}>
                {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save changes' : 'Create team')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
});

export const TeamFormDialog = defineModal<
  TeamFormDialogProps,
  TeamFormDialogResult
>(TeamFormDialogImpl);
