import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { ArchiveIcon } from '@phosphor-icons/react';
import type { AppBarProject } from '@vibe/ui/components/AppBar';
import { Button } from '@vibe/ui/components/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@vibe/ui/components/KeyboardDialog';
import { defineModal } from '@vibe/ui/lib/modals';

export interface ArchivedProjectsDialogProps {
  projects: AppBarProject[];
  onResumeProject: (projectId: string) => Promise<void>;
}

const ArchivedProjectsDialogImpl =
  NiceModal.create<ArchivedProjectsDialogProps>(
    ({ projects, onResumeProject }) => {
      const modal = useModal();

      const handleOpenChange = (open: boolean) => {
        if (!open) {
          modal.hide();
        }
      };

      const handleResumeProject = async (projectId: string) => {
        await onResumeProject(projectId);
        modal.hide();
      };

      return (
        <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Archived projects</DialogTitle>
              <DialogDescription>
                Resume a project to restore it to the main project list.
              </DialogDescription>
            </DialogHeader>

            {projects.length === 0 ? (
              <div className="rounded-lg border border-border bg-secondary/60 px-4 py-8 text-center">
                <ArchiveIcon
                  className="mx-auto h-8 w-8 text-low"
                  weight="duotone"
                />
                <p className="mt-3 text-sm font-medium text-high">
                  No archived projects
                </p>
                <p className="mt-1 text-sm text-low">
                  Archived projects will appear here when you need to bring them
                  back.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/60 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: `hsl(${project.color})` }}
                        />
                        <p className="truncate text-sm font-medium text-high">
                          {project.name}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleResumeProject(project.id)}
                    >
                      Resume
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      );
    }
  );

export const ArchivedProjectsDialog = defineModal<
  ArchivedProjectsDialogProps,
  void
>(ArchivedProjectsDialogImpl);
