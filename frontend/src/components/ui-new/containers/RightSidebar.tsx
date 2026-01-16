import { useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FileTreeContainer } from '@/components/ui-new/containers/FileTreeContainer';
import { ProcessListContainer } from '@/components/ui-new/containers/ProcessListContainer';
import { PreviewControlsContainer } from '@/components/ui-new/containers/PreviewControlsContainer';
import { GitPanelContainer } from '@/components/ui-new/containers/GitPanelContainer';
import { TerminalPanelContainer } from '@/components/ui-new/containers/TerminalPanelContainer';
import { ProjectSelectorContainer } from '@/components/ui-new/containers/ProjectSelectorContainer';
import { RecentReposListContainer } from '@/components/ui-new/containers/RecentReposListContainer';
import { BrowseRepoButtonContainer } from '@/components/ui-new/containers/BrowseRepoButtonContainer';
import { CreateRepoButtonContainer } from '@/components/ui-new/containers/CreateRepoButtonContainer';
import { useChangesView } from '@/contexts/ChangesViewContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { useMultiRepoBranches } from '@/hooks/useRepoBranches';
import { useProjects } from '@/hooks/useProjects';
import { CreateProjectDialog } from '@/components/ui-new/dialogs/CreateProjectDialog';
import { SelectedReposList } from '@/components/ui-new/primitives/SelectedReposList';
import { WarningIcon } from '@phosphor-icons/react';
import type { Workspace, RepoWithTargetBranch } from 'shared/types';
import {
  RIGHT_MAIN_PANEL_MODES,
  PERSIST_KEYS,
  type RightMainPanelMode,
  useExpandedAll,
  usePersistedExpanded,
  useUiPreferencesStore,
  PersistKey,
} from '@/stores/useUiPreferencesStore';
import { CollapsibleSectionHeader } from '../primitives/CollapsibleSectionHeader';

type SectionDef = {
  title: string;
  persistKey: PersistKey;
  visible: boolean;
  expanded: boolean;
  content: React.ReactNode;
};

export interface RightSidebarProps {
  isCreateMode: boolean;
  rightMainPanelMode: RightMainPanelMode | null;
  selectedWorkspace: Workspace | undefined;
  repos: RepoWithTargetBranch[];
}

export function RightSidebar({
  isCreateMode,
  rightMainPanelMode,
  selectedWorkspace,
  repos,
}: RightSidebarProps) {
  const { t } = useTranslation(['tasks', 'common']);
  const { selectFile } = useChangesView();
  const { diffs } = useWorkspaceContext();
  const { setExpanded } = useExpandedAll();
  const isTerminalVisible = useUiPreferencesStore((s) => s.isTerminalVisible);

  const {
    repos: createRepos,
    addRepo,
    removeRepo,
    clearRepos,
    targetBranches,
    setTargetBranch,
    selectedProjectId,
    setSelectedProjectId,
  } = useCreateMode();
  const { projects } = useProjects();

  const repoIds = useMemo(() => createRepos.map((r) => r.id), [createRepos]);
  const { branchesByRepo } = useMultiRepoBranches(repoIds);

  useEffect(() => {
    if (!isCreateMode) return;
    createRepos.forEach((repo) => {
      const branches = branchesByRepo[repo.id];
      if (branches && !targetBranches[repo.id]) {
        const currentBranch = branches.find((b) => b.is_current);
        if (currentBranch) {
          setTargetBranch(repo.id, currentBranch.name);
        }
      }
    });
  }, [
    isCreateMode,
    createRepos,
    branchesByRepo,
    targetBranches,
    setTargetBranch,
  ]);

  const [changesExpanded] = usePersistedExpanded(
    PERSIST_KEYS.changesSection,
    true
  );
  const [processesExpanded] = usePersistedExpanded(
    PERSIST_KEYS.processesSection,
    true
  );
  const [devServerExpanded] = usePersistedExpanded(
    PERSIST_KEYS.devServerSection,
    true
  );
  const [gitExpanded] = usePersistedExpanded(
    PERSIST_KEYS.gitPanelRepositories,
    true
  );
  const [terminalExpanded] = usePersistedExpanded(
    PERSIST_KEYS.terminalSection,
    true
  );

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const registeredRepoPaths = useMemo(
    () => createRepos.map((r) => r.path),
    [createRepos]
  );

  const handleCreateProject = useCallback(async () => {
    const result = await CreateProjectDialog.show({});
    if (result.status === 'saved') {
      setSelectedProjectId(result.project.id);
      clearRepos();
    }
  }, [setSelectedProjectId, clearRepos]);

  const hasNoRepos = createRepos.length === 0;

  const hasUpperContent =
    rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES ||
    rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS ||
    rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW;

  const getUpperExpanded = () => {
    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES)
      return changesExpanded;
    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS)
      return processesExpanded;
    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW)
      return devServerExpanded;
    return false;
  };

  const upperExpanded = getUpperExpanded();

  const sections: SectionDef[] = isCreateMode
    ? [
        {
          title: t('common:sections.project'),
          persistKey: PERSIST_KEYS.gitPanelProject,
          visible: true,
          expanded: true,
          content: (
            <div className="p-base">
              <ProjectSelectorContainer
                projects={projects}
                selectedProjectId={selectedProjectId}
                selectedProjectName={selectedProject?.name}
                onProjectSelect={(p) => setSelectedProjectId(p.id)}
                onCreateProject={handleCreateProject}
              />
            </div>
          ),
        },
        {
          title: t('common:sections.repositories'),
          persistKey: PERSIST_KEYS.gitPanelRepositories,
          visible: true,
          expanded: true,
          content: hasNoRepos ? (
            <div className="p-base">
              <div className="flex items-center gap-2 p-base rounded bg-warning/10 border border-warning/20">
                <WarningIcon className="h-4 w-4 text-warning shrink-0" />
                <p className="text-sm text-warning">
                  {t('gitPanel.create.warnings.noReposSelected')}
                </p>
              </div>
            </div>
          ) : (
            <SelectedReposList
              repos={createRepos}
              onRemove={removeRepo}
              branchesByRepo={branchesByRepo}
              selectedBranches={targetBranches}
              onBranchChange={setTargetBranch}
            />
          ),
        },
        {
          title: t('common:sections.addRepositories'),
          persistKey: PERSIST_KEYS.gitPanelAddRepositories,
          visible: true,
          expanded: true,
          content: (
            <div className="flex flex-col gap-base p-base">
              <p className="text-xs text-low font-medium">
                {t('common:sections.recent')}
              </p>
              <RecentReposListContainer
                registeredRepoPaths={registeredRepoPaths}
                onRepoRegistered={addRepo}
              />
              <p className="text-xs text-low font-medium">
                {t('common:sections.other')}
              </p>
              <BrowseRepoButtonContainer onRepoRegistered={addRepo} />
              <CreateRepoButtonContainer onRepoCreated={addRepo} />
            </div>
          ),
        },
      ]
    : buildWorkspaceSections();

  function buildWorkspaceSections(): SectionDef[] {
    const result: SectionDef[] = [
      {
        title: 'Git',
        persistKey: PERSIST_KEYS.gitPanelRepositories,
        visible: true,
        expanded: gitExpanded,
        content: (
          <GitPanelContainer
            selectedWorkspace={selectedWorkspace}
            repos={repos}
            diffs={diffs}
          />
        ),
      },
      {
        title: 'Terminal',
        persistKey: PERSIST_KEYS.terminalSection,
        visible: isTerminalVisible,
        expanded: terminalExpanded,
        content: <TerminalPanelContainer />,
      },
    ];

    switch (rightMainPanelMode) {
      case RIGHT_MAIN_PANEL_MODES.CHANGES:
        result.unshift({
          title: 'Changes',
          persistKey: PERSIST_KEYS.changesSection,
          visible: hasUpperContent,
          expanded: upperExpanded,
          content: (
            <FileTreeContainer
              key={selectedWorkspace?.id}
              workspaceId={selectedWorkspace?.id}
              diffs={diffs}
              onSelectFile={(path) => {
                selectFile(path);
                setExpanded(`diff:${path}`, true);
              }}
            />
          ),
        });
        break;
      case RIGHT_MAIN_PANEL_MODES.LOGS:
        result.unshift({
          title: 'Logs',
          persistKey: PERSIST_KEYS.rightPanelprocesses,
          visible: hasUpperContent,
          expanded: upperExpanded,
          content: <ProcessListContainer />,
        });
        break;
      case RIGHT_MAIN_PANEL_MODES.PREVIEW:
        result.unshift({
          title: 'Preview',
          persistKey: PERSIST_KEYS.rightPanelPreview,
          visible: hasUpperContent,
          expanded: upperExpanded,
          content: (
            <PreviewControlsContainer attemptId={selectedWorkspace?.id} />
          ),
        });
        break;
      case null:
        break;
    }

    return result;
  }

  return (
    <div className="h-full border-l bg-secondary overflow-y-auto">
      <div className="divide-y border-b">
        {sections.map((section) => (
          <div
            key={section.persistKey}
            className="max-h-[max(50vh,400px)] flex flex-col overflow-hidden"
          >
            <CollapsibleSectionHeader
              title={section.title}
              persistKey={section.persistKey}
            >
              <div className="flex flex-1 border-t min-h-[200px]">
                {section.content}
              </div>
            </CollapsibleSectionHeader>
          </div>
        ))}
      </div>
    </div>
  );
}
