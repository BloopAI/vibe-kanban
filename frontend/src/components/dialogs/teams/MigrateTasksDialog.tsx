import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { teamsApi } from '@/lib/api';
import { useTeams } from '@/hooks/useTeams';
import { useProjects } from '@/hooks/useProjects';

export interface MigrateTasksDialogProps {
  // Pre-select a team if provided
  teamId?: string;
  // Pre-select a project if provided
  projectId?: string;
}

export interface MigrateTasksDialogResult {
  migratedCount: number;
  taskIds: string[];
}

const MigrateTasksDialogImpl = NiceModal.create<MigrateTasksDialogProps>(
  ({ teamId: initialTeamId, projectId: initialProjectId }) => {
    const modal = useModal();
    const { teams } = useTeams();
    const { projects } = useProjects();

    const [selectedTeamId, setSelectedTeamId] = useState<string>(initialTeamId || '');
    const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<MigrateTasksDialogResult | null>(null);

    const selectedTeam = useMemo(
      () => teams.find((t) => t.id === selectedTeamId),
      [teams, selectedTeamId]
    );

    const selectedProject = useMemo(
      () => projects.find((p) => p.id === selectedProjectId),
      [projects, selectedProjectId]
    );

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!selectedTeamId) {
        setError('Please select a team');
        return;
      }

      if (!selectedProjectId) {
        setError('Please select a project');
        return;
      }

      try {
        setIsSubmitting(true);
        setError(null);

        const response = await teamsApi.migrateTasks(selectedTeamId, {
          project_id: selectedProjectId,
        });

        setResult({
          migratedCount: response.migrated_count,
          taskIds: response.task_ids,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to migrate tasks');
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleClose = () => {
      if (result) {
        modal.resolve(result);
      } else {
        modal.reject(new Error('Cancelled'));
      }
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleClose();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[480px]">
          {result ? (
            // Success state
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Migration Complete
                </DialogTitle>
                <DialogDescription>
                  Successfully migrated tasks to team issues.
                </DialogDescription>
              </DialogHeader>

              <div className="py-6">
                <div className="rounded-lg border bg-muted/50 p-4 text-center">
                  <div className="text-3xl font-bold text-primary">
                    {result.migratedCount}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {result.migratedCount === 1 ? 'task migrated' : 'tasks migrated'}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-center gap-3 text-sm text-muted-foreground">
                  <span>{selectedProject?.name || 'Project'}</span>
                  <ArrowRight className="h-4 w-4" />
                  <span className="flex items-center gap-1">
                    {selectedTeam?.icon && <span>{selectedTeam.icon}</span>}
                    {selectedTeam?.name || 'Team'}
                  </span>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={handleClose}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            // Form state
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Migrate Tasks to Team Issues</DialogTitle>
                <DialogDescription>
                  Convert project tasks into team issues. Tasks will be assigned sequential issue numbers and can be filtered by project.
                </DialogDescription>
              </DialogHeader>

              <div className="py-6 space-y-5">
                {/* Source Project */}
                <div className="space-y-2">
                  <Label htmlFor="source-project">Source project</Label>
                  <Select
                    value={selectedProjectId}
                    onValueChange={setSelectedProjectId}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="source-project" className="h-10">
                      <SelectValue placeholder="Select a project..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          <span className="flex items-center gap-2">
                            <span>{project.icon || '📁'}</span>
                            <span>{project.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Only tasks that aren&apos;t already team issues will be migrated
                  </p>
                </div>

                {/* Migration Arrow */}
                <div className="flex items-center justify-center py-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="h-px w-8 bg-border" />
                    <ArrowRight className="h-4 w-4" />
                    <div className="h-px w-8 bg-border" />
                  </div>
                </div>

                {/* Target Team */}
                <div className="space-y-2">
                  <Label htmlFor="target-team">Target team</Label>
                  <Select
                    value={selectedTeamId}
                    onValueChange={setSelectedTeamId}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="target-team" className="h-10">
                      <SelectValue placeholder="Select a team..." />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          <span className="flex items-center gap-2">
                            {team.icon && <span>{team.icon}</span>}
                            <span>{team.name}</span>
                            {team.identifier && (
                              <span className="text-xs text-muted-foreground font-mono">
                                ({team.identifier})
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Tasks will become issues with IDs like {selectedTeam?.identifier || 'TEAM'}-1, {selectedTeam?.identifier || 'TEAM'}-2, etc.
                  </p>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !selectedTeamId || !selectedProjectId}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Migrating...
                    </>
                  ) : (
                    'Migrate Tasks'
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    );
  }
);

export const MigrateTasksDialog = defineModal<
  MigrateTasksDialogProps,
  MigrateTasksDialogResult
>(MigrateTasksDialogImpl);
