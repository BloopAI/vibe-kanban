import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useOrganizationProjects } from '@/hooks/useOrganizationProjects';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { useAuth } from '@/hooks/auth/useAuth';
import { LoginRequiredPrompt } from '@/components/dialogs/shared/LoginRequiredPrompt';
import type { Project } from 'shared/types';
import { useTranslation } from 'react-i18next';

export type LinkProjectResult = {
  action: 'linked' | 'canceled';
  project?: Project;
};

interface LinkProjectDialogProps {
  projectId: string;
  projectName: string;
}

type LinkMode = 'existing' | 'create';

export const LinkProjectDialog = NiceModal.create<LinkProjectDialogProps>(
  ({ projectId, projectName }) => {
    const modal = useModal();
    const { t } = useTranslation('projects');
    const { t: tCommon } = useTranslation('common');
    const { isSignedIn } = useAuth();
    const { data: orgsResponse, isLoading: orgsLoading } =
      useUserOrganizations();

    const [selectedOrgId, setSelectedOrgId] = useState<string>('');
    const [linkMode, setLinkMode] = useState<LinkMode>('existing');
    const [selectedRemoteProjectId, setSelectedRemoteProjectId] =
      useState<string>('');
    const [newProjectName, setNewProjectName] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Compute default organization (prefer non-personal)
    const defaultOrgId = useMemo(() => {
      const orgs = orgsResponse?.organizations ?? [];
      return orgs.find((o) => !o.is_personal)?.id ?? orgs[0]?.id ?? '';
    }, [orgsResponse]);

    // Use selected or default
    const currentOrgId = selectedOrgId || defaultOrgId;

    const { data: remoteProjects = [], isLoading: isLoadingProjects } =
      useOrganizationProjects(linkMode === 'existing' ? currentOrgId : null);

    // Compute default project (first in list)
    const defaultProjectId = useMemo(() => {
      return remoteProjects[0]?.id ?? '';
    }, [remoteProjects]);

    // Use selected or default
    const currentProjectId = selectedRemoteProjectId || defaultProjectId;

    const { linkToExisting, createAndLink } = useProjectMutations({
      onLinkSuccess: (project) => {
        modal.resolve({
          action: 'linked',
          project,
        } as LinkProjectResult);
        modal.hide();
      },
      onLinkError: (err) => {
        setError(
          err instanceof Error ? err.message : t('linkDialog.errors.linkFailed')
        );
      },
    });

    const isSubmitting = linkToExisting.isPending || createAndLink.isPending;

    useEffect(() => {
      if (modal.visible) {
        // Reset form when dialog opens
        setLinkMode('existing');
        setSelectedOrgId(defaultOrgId);
        setSelectedRemoteProjectId('');
        setNewProjectName(projectName);
        setError(null);
      } else {
        // Cleanup when dialog closes
        setLinkMode('existing');
        setSelectedOrgId('');
        setSelectedRemoteProjectId('');
        setNewProjectName('');
        setError(null);
      }
    }, [modal.visible, projectName, defaultOrgId]);

    const handleOrgChange = (orgId: string) => {
      setSelectedOrgId(orgId);
      setSelectedRemoteProjectId(''); // Reset to first project of new org
      setNewProjectName(projectName); // Reset to current project name
      setError(null);
    };

    const handleLink = () => {
      if (!currentOrgId) {
        setError(t('linkDialog.errors.selectOrganization'));
        return;
      }

      setError(null);

      if (linkMode === 'existing') {
        if (!currentProjectId) {
          setError(t('linkDialog.errors.selectRemoteProject'));
          return;
        }
        linkToExisting.mutate({
          localProjectId: projectId,
          data: { remote_project_id: currentProjectId },
        });
      } else {
        if (!newProjectName.trim()) {
          setError(t('linkDialog.errors.enterProjectName'));
          return;
        }
        createAndLink.mutate({
          localProjectId: projectId,
          data: { organization_id: currentOrgId, name: newProjectName.trim() },
        });
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

    const canSubmit = () => {
      if (!currentOrgId || isSubmitting) return false;
      if (linkMode === 'existing') {
        return !!currentProjectId && !isLoadingProjects;
      } else {
        return !!newProjectName.trim();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('linkDialog.title')}</DialogTitle>
            <DialogDescription>{t('linkDialog.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">
                {t('linkDialog.projectLabel')}
              </Label>
              <div className="px-3 py-2 bg-muted rounded-md text-sm">
                {projectName}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="organization-select">
                {t('linkDialog.organizationLabel')}
              </Label>
              {orgsLoading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {t('linkDialog.loadingOrganizations')}
                </div>
              ) : !isSignedIn ? (
                <LoginRequiredPrompt
                  title={t('linkDialog.loginRequired.title')}
                  description={t('linkDialog.loginRequired.description')}
                  actionLabel={t('linkDialog.loginRequired.action')}
                />
              ) : !orgsResponse?.organizations?.length ? (
                <Alert>
                  <AlertDescription>
                    {t('linkDialog.noOrganizations')}
                  </AlertDescription>
                </Alert>
              ) : (
                <Select
                  value={selectedOrgId}
                  onValueChange={handleOrgChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="organization-select">
                    <SelectValue
                      placeholder={t('linkDialog.selectOrganization')}
                    />
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

            {currentOrgId && (
              <>
                <div className="space-y-2">
                  <Label>{t('linkDialog.linkModeLabel')}</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={linkMode === 'existing' ? 'default' : 'outline'}
                      onClick={() => setLinkMode('existing')}
                      disabled={isSubmitting}
                      className="flex-1"
                    >
                      {t('linkDialog.linkToExisting')}
                    </Button>
                    <Button
                      type="button"
                      variant={linkMode === 'create' ? 'default' : 'outline'}
                      onClick={() => setLinkMode('create')}
                      disabled={isSubmitting}
                      className="flex-1"
                    >
                      {t('linkDialog.createNew')}
                    </Button>
                  </div>
                </div>

                {linkMode === 'existing' ? (
                  <div className="space-y-2">
                    <Label htmlFor="remote-project-select">
                      {t('linkDialog.remoteProjectLabel')}
                    </Label>
                    {isLoadingProjects ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        {t('linkDialog.loadingRemoteProjects')}
                      </div>
                    ) : remoteProjects.length === 0 ? (
                      <Alert>
                        <AlertDescription>
                          {t('linkDialog.noRemoteProjects')}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <Select
                        value={currentProjectId}
                        onValueChange={(id) => {
                          setSelectedRemoteProjectId(id);
                          setError(null);
                        }}
                        disabled={isSubmitting}
                      >
                        <SelectTrigger id="remote-project-select">
                          <SelectValue
                            placeholder={t('linkDialog.selectRemoteProject')}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {remoteProjects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="new-project-name">
                      {t('linkDialog.newProjectNameLabel')}
                    </Label>
                    <Input
                      id="new-project-name"
                      type="text"
                      value={newProjectName}
                      onChange={(e) => {
                        setNewProjectName(e.target.value);
                        setError(null);
                      }}
                      placeholder={t('linkDialog.newProjectNamePlaceholder')}
                      disabled={isSubmitting}
                    />
                  </div>
                )}
              </>
            )}

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
              {tCommon('buttons.cancel')}
            </Button>
            <Button
              onClick={handleLink}
              disabled={!canSubmit() || !orgsResponse?.organizations?.length}
            >
              {isSubmitting
                ? t('linkDialog.linking')
                : t('linkDialog.linkButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
