import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SpinnerIcon,
  PlusIcon,
  TrashIcon,
  DotsThreeIcon,
  SignInIcon,
} from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../primitives/Dropdown';
import { PrimaryButton } from '../../primitives/PrimaryButton';
import { useUserOrganizations } from '@/hooks/useUserOrganizations';
import { useAuth } from '@/hooks/auth/useAuth';
import { OAuthDialog } from '@/components/dialogs/global/OAuthDialog';
import { CreateRemoteProjectDialog } from '@/components/dialogs/org/CreateRemoteProjectDialog';
import { DeleteRemoteProjectDialog } from '@/components/dialogs/org/DeleteRemoteProjectDialog';
import { useEntity } from '@/lib/electric/hooks';
import { PROJECT_ENTITY, type Project } from 'shared/remote-types';
import { PRESET_COLORS } from '@/lib/colors';
import { InlineColorPicker } from '../../primitives/ColorPicker';
import { cn } from '@/lib/utils';
import {
  SettingsCard,
  SettingsField,
  SettingsInput,
  SettingsSaveBar,
  TwoColumnPicker,
  TwoColumnPickerColumn,
  TwoColumnPickerItem,
  TwoColumnPickerBadge,
  TwoColumnPickerEmpty,
} from './SettingsComponents';
import { useSettingsDirty } from './SettingsDirtyContext';

interface FormState {
  name: string;
  color: string;
}

interface RemoteProjectsSettingsSectionProps {
  initialState?: { organizationId?: string; projectId?: string };
}

export function RemoteProjectsSettingsSection({
  initialState,
}: RemoteProjectsSettingsSectionProps) {
  const { t } = useTranslation(['settings', 'common', 'projects']);
  const { setDirty: setContextDirty } = useSettingsDirty();
  const { isSignedIn, isLoaded } = useAuth();

  // Selection state - initialize with provided values
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(
    initialState?.organizationId ?? null
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialState?.projectId ?? null
  );

  // Form state for editing
  const [formState, setFormState] = useState<FormState | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch organizations
  const {
    data: orgsResponse,
    isLoading: orgsLoading,
    error: orgsError,
  } = useUserOrganizations();

  const organizations = useMemo(
    () => orgsResponse?.organizations ?? [],
    [orgsResponse?.organizations]
  );

  // Auto-select first org when loaded (only if no initial org was provided)
  useEffect(() => {
    if (
      !initialState?.organizationId &&
      organizations.length > 0 &&
      !selectedOrgId
    ) {
      setSelectedOrgId(organizations[0].id);
    }
  }, [organizations, selectedOrgId, initialState?.organizationId]);

  // Fetch projects for selected org
  const params = useMemo(
    () => ({ organization_id: selectedOrgId || '' }),
    [selectedOrgId]
  );

  const {
    data: projects,
    isLoading: projectsLoading,
    update,
    remove,
  } = useEntity(PROJECT_ENTITY, params, { enabled: !!selectedOrgId });

  // Initialize form state when project is pre-selected and projects are loaded
  useEffect(() => {
    if (initialState?.projectId && projects.length > 0 && !formState) {
      const project = projects.find((p) => p.id === initialState.projectId);
      if (project) {
        setFormState({ name: project.name, color: project.color });
      }
    }
  }, [initialState?.projectId, projects, formState]);

  // Find selected project
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  // Calculate dirty state
  const isDirty = useMemo(() => {
    if (!selectedProject || !formState) return false;
    return (
      formState.name !== selectedProject.name ||
      formState.color !== selectedProject.color
    );
  }, [selectedProject, formState]);

  // Sync dirty state to context for unsaved changes confirmation
  useEffect(() => {
    setContextDirty('remote-projects', isDirty);
    return () => setContextDirty('remote-projects', false);
  }, [isDirty, setContextDirty]);

  // Handlers
  const handleOrgSelect = (orgId: string) => {
    if (isDirty) {
      const confirmed = window.confirm(
        t('settings.common.discardChangesConfirm', 'Discard unsaved changes?')
      );
      if (!confirmed) return;
    }
    setSelectedOrgId(orgId);
    setSelectedProjectId(null);
    setFormState(null);
    setError(null);
    setSuccess(null);
  };

  const handleProjectSelect = (projectId: string) => {
    if (isDirty) {
      const confirmed = window.confirm(
        t('settings.common.discardChangesConfirm', 'Discard unsaved changes?')
      );
      if (!confirmed) return;
    }
    const project = projects.find((p) => p.id === projectId);
    setSelectedProjectId(projectId);
    setFormState(project ? { name: project.name, color: project.color } : null);
    setError(null);
    setSuccess(null);
  };

  const handleCreateProject = async () => {
    if (!selectedOrgId) return;

    try {
      const result = await CreateRemoteProjectDialog.show({
        organizationId: selectedOrgId,
      });

      if (result.action === 'created' && result.project) {
        setSelectedProjectId(result.project.id);
        setFormState({
          name: result.project.name,
          color: result.project.color,
        });
        setSuccess(
          t(
            'settings.remoteProjects.createSuccess',
            'Project created successfully'
          )
        );
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      // Dialog cancelled
    }
  };

  const handleDeleteProject = async (project: Project) => {
    try {
      const result = await DeleteRemoteProjectDialog.show({
        projectName: project.name,
      });

      if (result === 'deleted') {
        remove(project.id);
        if (selectedProjectId === project.id) {
          setSelectedProjectId(null);
          setFormState(null);
        }
        setSuccess(
          t(
            'settings.remoteProjects.deleteSuccess',
            'Project deleted successfully'
          )
        );
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch {
      // Dialog cancelled
    }
  };

  const handleSave = async () => {
    if (!selectedProjectId || !formState) return;

    const trimmedName = formState.name.trim();
    if (!trimmedName) {
      setError(
        t('settings.remoteProjects.nameRequired', 'Project name is required')
      );
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const result = update(selectedProjectId, {
        name: trimmedName,
        color: formState.color,
      });
      await result.persisted;
      setSuccess(
        t('settings.remoteProjects.saveSuccess', 'Project updated successfully')
      );
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('settings.remoteProjects.saveError', 'Failed to update project')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    if (selectedProject) {
      setFormState({
        name: selectedProject.name,
        color: selectedProject.color,
      });
    }
  };

  // Loading state
  if (!isLoaded || orgsLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <SpinnerIcon
          className="size-icon-lg animate-spin text-brand"
          weight="bold"
        />
        <span className="text-normal">
          {t('settings.remoteProjects.loading', 'Loading remote projects...')}
        </span>
      </div>
    );
  }

  // Auth check - show login prompt if not signed in
  if (!isSignedIn) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-medium text-high">
            {t(
              'settings.remoteProjects.loginRequired.title',
              'Sign in Required'
            )}
          </h3>
          <p className="text-sm text-low mt-1">
            {t(
              'settings.remoteProjects.loginRequired.description',
              'Sign in to manage your remote projects.'
            )}
          </p>
        </div>
        <PrimaryButton
          variant="secondary"
          value={t('settings.remoteProjects.loginRequired.action', 'Sign In')}
          onClick={() => void OAuthDialog.show()}
        >
          <SignInIcon className="size-icon-xs mr-1" weight="bold" />
        </PrimaryButton>
      </div>
    );
  }

  // Error state
  if (orgsError) {
    return (
      <div className="py-8">
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {orgsError instanceof Error
            ? orgsError.message
            : t(
                'settings.remoteProjects.loadError',
                'Failed to load organizations'
              )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Status messages */}
      {error && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success/10 border border-success/50 rounded-sm p-4 text-success font-medium mb-4">
          {success}
        </div>
      )}

      <SettingsCard
        title={t('settings.remoteProjects.title', 'Remote Projects')}
        description={t(
          'settings.remoteProjects.description',
          'Manage cloud-synced projects across organizations.'
        )}
      >
        {/* Two-column picker */}
        <TwoColumnPicker>
          {/* Organizations column */}
          <TwoColumnPickerColumn
            label={t(
              'settings.remoteProjects.columns.organizations',
              'Organizations'
            )}
            isFirst
          >
            {organizations.map((org) => (
              <TwoColumnPickerItem
                key={org.id}
                selected={selectedOrgId === org.id}
                onClick={() => handleOrgSelect(org.id)}
                trailing={
                  org.is_personal && (
                    <TwoColumnPickerBadge>
                      {t('common:personal', 'Personal')}
                    </TwoColumnPickerBadge>
                  )
                }
              >
                {org.name}
              </TwoColumnPickerItem>
            ))}
          </TwoColumnPickerColumn>

          {/* Projects column */}
          <TwoColumnPickerColumn
            label={t('settings.remoteProjects.columns.projects', 'Projects')}
            headerAction={
              selectedOrgId && (
                <button
                  className="p-half rounded-sm hover:bg-secondary text-low hover:text-normal"
                  onClick={handleCreateProject}
                  disabled={isSaving}
                  title={t(
                    'settings.remoteProjects.actions.addProject',
                    'Add Project'
                  )}
                >
                  <PlusIcon className="size-icon-2xs" weight="bold" />
                </button>
              )
            }
          >
            {projectsLoading ? (
              <div className="flex items-center justify-center py-double gap-base">
                <SpinnerIcon className="size-icon-sm animate-spin" />
              </div>
            ) : selectedOrgId && projects.length > 0 ? (
              projects.map((project) => (
                <TwoColumnPickerItem
                  key={project.id}
                  selected={selectedProjectId === project.id}
                  onClick={() => handleProjectSelect(project.id)}
                  leading={
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: `hsl(${project.color})` }}
                    />
                  }
                  trailing={
                    <ProjectActionsDropdown
                      project={project}
                      onDelete={handleDeleteProject}
                    />
                  }
                >
                  {project.name}
                </TwoColumnPickerItem>
              ))
            ) : selectedOrgId ? (
              <TwoColumnPickerEmpty>
                {t(
                  'settings.remoteProjects.noProjects',
                  'No projects yet. Create one to get started.'
                )}
              </TwoColumnPickerEmpty>
            ) : (
              <TwoColumnPickerEmpty>
                {t(
                  'settings.remoteProjects.selectOrg',
                  'Select an organization'
                )}
              </TwoColumnPickerEmpty>
            )}
          </TwoColumnPickerColumn>
        </TwoColumnPicker>

        {/* Edit form (when project selected) */}
        {selectedProjectId && formState && (
          <div className="bg-secondary/50 border border-border rounded-sm p-4 space-y-4">
            <SettingsField
              label={t(
                'settings.remoteProjects.form.name.label',
                'Project Name'
              )}
            >
              <SettingsInput
                value={formState.name}
                onChange={(name) =>
                  setFormState((s) => (s ? { ...s, name } : null))
                }
                placeholder={t(
                  'settings.remoteProjects.form.name.placeholder',
                  'Enter project name'
                )}
                disabled={isSaving}
              />
            </SettingsField>

            <SettingsField
              label={t(
                'settings.remoteProjects.form.color.label',
                'Project Color'
              )}
            >
              <InlineColorPicker
                value={formState.color}
                onChange={(color) =>
                  setFormState((s) => (s ? { ...s, color } : null))
                }
                colors={PRESET_COLORS}
                disabled={isSaving}
              />
            </SettingsField>
          </div>
        )}
      </SettingsCard>

      <SettingsSaveBar
        show={isDirty}
        saving={isSaving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </>
  );
}

// Helper component for project actions dropdown
function ProjectActionsDropdown({
  project,
  onDelete,
}: {
  project: Project;
  onDelete: (project: Project) => void;
}) {
  const { t } = useTranslation(['common']);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'p-half rounded-sm hover:bg-panel text-low hover:text-normal',
            'opacity-0 group-hover:opacity-100 transition-opacity'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <DotsThreeIcon className="size-icon-xs" weight="bold" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project);
          }}
          className="text-error focus:text-error"
        >
          <div className="flex items-center gap-half w-full">
            <TrashIcon className="size-icon-xs mr-base" />
            {t('common:buttons.delete', 'Delete')}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Alias for backwards compatibility
export { RemoteProjectsSettingsSection as RemoteProjectsSettingsSectionContent };
