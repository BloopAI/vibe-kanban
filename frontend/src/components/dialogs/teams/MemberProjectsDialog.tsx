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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, FolderKanban } from 'lucide-react';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { defineModal } from '@/lib/modals';
import { teamsApi } from '@/lib/api';
import { useProjects } from '@/hooks/useProjects';

export interface MemberProjectsDialogProps {
  teamId: string;
  memberId: string;
  memberName: string;
}

export type MemberProjectsDialogResult = 'saved' | 'canceled';

const MemberProjectsDialogImpl = NiceModal.create<MemberProjectsDialogProps>(
  ({ teamId, memberId, memberName }) => {
    const modal = useModal();
    const { projects, isLoading: projectsLoading } = useProjects();

    const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load member's current project access
    useEffect(() => {
      const loadMemberProjects = async () => {
        try {
          setIsLoading(true);
          const projectIds = await teamsApi.getMemberProjects(teamId, memberId);
          setSelectedProjects(new Set(projectIds));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load member projects');
        } finally {
          setIsLoading(false);
        }
      };

      loadMemberProjects();
    }, [teamId, memberId]);

    const handleToggleProject = (projectId: string) => {
      setSelectedProjects((prev) => {
        const next = new Set(prev);
        if (next.has(projectId)) {
          next.delete(projectId);
        } else {
          next.add(projectId);
        }
        return next;
      });
    };

    const handleSelectAll = () => {
      setSelectedProjects(new Set(projects.map((p) => p.id)));
    };

    const handleDeselectAll = () => {
      setSelectedProjects(new Set());
    };

    const handleSave = async () => {
      try {
        setIsSaving(true);
        setError(null);
        await teamsApi.setMemberProjects(teamId, memberId, Array.from(selectedProjects));
        modal.resolve('saved' as MemberProjectsDialogResult);
        modal.hide();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save project access');
      } finally {
        setIsSaving(false);
      }
    };

    const handleClose = () => {
      modal.resolve('canceled' as MemberProjectsDialogResult);
      modal.hide();
    };

    const loading = isLoading || projectsLoading;

    return (
      <Dialog
        open={modal.visible}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              Configure Project Access
            </DialogTitle>
            <DialogDescription>
              Select which projects <span className="font-medium">{memberName}</span> can access.
              Unchecked projects will be hidden from this member.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {/* Select/Deselect All */}
              <div className="flex items-center gap-2 text-sm">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-muted-foreground hover:text-foreground"
                  onClick={handleSelectAll}
                >
                  Select all
                </Button>
                <span className="text-muted-foreground">/</span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-muted-foreground hover:text-foreground"
                  onClick={handleDeselectAll}
                >
                  Deselect all
                </Button>
              </div>

              {/* Project List */}
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No projects in this team yet.
                  </p>
                ) : (
                  projects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`project-${project.id}`}
                        checked={selectedProjects.has(project.id)}
                        onCheckedChange={() => handleToggleProject(project.id)}
                      />
                      <Label
                        htmlFor={`project-${project.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="font-medium">{project.name}</div>
                        {project.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {project.description}
                          </div>
                        )}
                      </Label>
                    </div>
                  ))
                )}
              </div>

              {/* Summary */}
              <div className="text-sm text-muted-foreground border-t pt-3">
                {selectedProjects.size === 0 ? (
                  'No projects selected - member will have no project access'
                ) : selectedProjects.size === projects.length ? (
                  'All projects selected - member has full access'
                ) : (
                  `${selectedProjects.size} of ${projects.length} projects selected`
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || loading}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

export const MemberProjectsDialog = defineModal<
  MemberProjectsDialogProps,
  MemberProjectsDialogResult
>(MemberProjectsDialogImpl);
