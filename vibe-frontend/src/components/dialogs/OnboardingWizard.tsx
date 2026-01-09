import { useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, Loader2, Building2, Users, FolderKanban } from 'lucide-react';
import { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { useUserRegistration } from '@/hooks/useUserRegistration';
import type { CreateUserRegistration } from 'shared/types';

export interface OnboardingWizardProps {
  clerkUserId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

export type OnboardingWizardResult = 'submitted' | 'canceled';

function OnboardingWizardImpl(props: OnboardingWizardProps) {
  const modal = useModal();
  const { createRegistration, isCreating } = useUserRegistration();

  const [workspaceName, setWorkspaceName] = useState('');
  const [plannedTeams, setPlannedTeams] = useState('1');
  const [plannedProjects, setPlannedProjects] = useState('3');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!workspaceName.trim()) {
      setError('Workspace name is required');
      return;
    }

    setError(null);

    try {
      const data: CreateUserRegistration = {
        clerk_user_id: props.clerkUserId,
        email: props.email,
        first_name: props.firstName || null,
        last_name: props.lastName || null,
        workspace_name: workspaceName.trim(),
        planned_teams: parseInt(plannedTeams, 10),
        planned_projects: parseInt(plannedProjects, 10),
      };

      await createRegistration(data);
      modal.resolve('submitted' as OnboardingWizardResult);
      modal.hide();
    } catch (err) {
      console.error('Failed to submit registration:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit registration');
    }
  };

  const handleCancel = () => {
    modal.resolve('canceled' as OnboardingWizardResult);
    modal.hide();
  };

  return (
    <Dialog open={modal.visible} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Welcome to Vibe Kanban
          </DialogTitle>
          <DialogDescription>
            Let's set up your workspace. Tell us a bit about how you plan to use Vibe Kanban.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="workspace-name" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Workspace Name
            </Label>
            <Input
              id="workspace-name"
              placeholder="e.g., Acme Corp, My Startup, Personal Projects"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              This will be the name of your main workspace.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="planned-teams" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Expected Teams
              </Label>
              <Select value={plannedTeams} onValueChange={setPlannedTeams}>
                <SelectTrigger id="planned-teams">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 team</SelectItem>
                  <SelectItem value="2">2-3 teams</SelectItem>
                  <SelectItem value="5">4-5 teams</SelectItem>
                  <SelectItem value="10">6-10 teams</SelectItem>
                  <SelectItem value="20">10+ teams</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="planned-projects" className="flex items-center gap-2">
                <FolderKanban className="h-4 w-4" />
                Expected Projects
              </Label>
              <Select value={plannedProjects} onValueChange={setPlannedProjects}>
                <SelectTrigger id="planned-projects">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 project</SelectItem>
                  <SelectItem value="3">2-5 projects</SelectItem>
                  <SelectItem value="10">5-10 projects</SelectItem>
                  <SelectItem value="20">10-20 projects</SelectItem>
                  <SelectItem value="50">20+ projects</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Alert>
            <AlertDescription className="text-sm">
              After submitting, your registration will be reviewed by an administrator.
              You'll receive access once approved.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating || !workspaceName.trim()}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Registration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Export with NiceModal registration
export const OnboardingWizard = defineModal<OnboardingWizardProps, OnboardingWizardResult>(
  OnboardingWizardImpl
);
