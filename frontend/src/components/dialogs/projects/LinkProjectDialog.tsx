import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { projectsApi } from '@/lib/api';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useOrganizationSelection } from '@/hooks/useOrganizationSelection';
import type { Project } from 'shared/types';

export type LinkProjectResult = {
  action: 'linked' | 'canceled';
  project?: Project;
};

interface LinkProjectDialogProps {
  projectId: string;
  projectName: string;
}

export const LinkProjectDialog = NiceModal.create<LinkProjectDialogProps>(
  ({ projectId, projectName }) => {
    const modal = useModal();
    const { data: orgsResponse, isLoading: orgsLoading } =
      useUserOrganizations();
    const { selectedOrgId, handleOrgSelect } = useOrganizationSelection({
      organizations: orgsResponse,
    });

    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
      // Reset form when dialog opens
      if (modal.visible) {
        setError(null);
        setIsSubmitting(false);
      }
    }, [modal.visible]);

    const handleLink = async () => {
      if (!selectedOrgId) {
        setError('Please select an organization');
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const updatedProject = await projectsApi.linkToOrganization(
          projectId,
          selectedOrgId
        );

        modal.resolve({
          action: 'linked',
          project: updatedProject,
        } as LinkProjectResult);
        modal.hide();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to link project'
        );
        setIsSubmitting(false);
      }
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as LinkProjectResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link Project to Organization</DialogTitle>
            <DialogDescription>
              Link this local project to a remote organization for collaboration
              and syncing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project</Label>
              <div className="px-3 py-2 bg-muted rounded-md text-sm">
                {projectName}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization-select">Organization</Label>
              {orgsLoading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Loading organizations...
                </div>
              ) : !orgsResponse?.organizations?.length ? (
                <Alert>
                  <AlertDescription>
                    No organizations available. Create an organization first.
                  </AlertDescription>
                </Alert>
              ) : (
                <Select
                  value={selectedOrgId}
                  onValueChange={handleOrgSelect}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="organization-select">
                    <SelectValue placeholder="Select an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgsResponse.organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleLink}
              disabled={
                !selectedOrgId ||
                isSubmitting ||
                !orgsResponse?.organizations?.length
              }
            >
              {isSubmitting ? 'Linking...' : 'Link Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
