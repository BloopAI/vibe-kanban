import { GitPanelCreateContainer } from '@/components/ui-new/containers/GitPanelCreateContainer';
import { FileTreeContainer } from '@/components/ui-new/containers/FileTreeContainer';
import { ProcessListContainer } from '@/components/ui-new/containers/ProcessListContainer';
import { PreviewControlsContainer } from '@/components/ui-new/containers/PreviewControlsContainer';
import { GitPanelContainer } from '@/components/ui-new/containers/GitPanelContainer';
import { TerminalPanelContainer } from '@/components/ui-new/containers/TerminalPanelContainer';
import { useChangesView } from '@/contexts/ChangesViewContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
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
  const { selectFile } = useChangesView();
  const { diffs } = useWorkspaceContext();
  const { setExpanded } = useExpandedAll();
  const isTerminalVisible = useUiPreferencesStore((s) => s.isTerminalVisible);

  // Get expand states for each section to determine layout
  // Each section manages its own CollapsibleSectionHeader, but we read the state here for layout
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

  if (isCreateMode) {
    return <GitPanelCreateContainer />;
  }

  // Determine if we have upper content based on mode
  const hasUpperContent =
    rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES ||
    rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS ||
    rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW;

  // Get the expand state for the current upper section
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

  const sections: {
    title: string;
    persistKey: PersistKey;
    visible: boolean;
    expanded: boolean;
    content: React.ReactNode;
  }[] = [
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
      sections.unshift({
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
      sections.unshift({
        title: 'Logs',
        persistKey: PERSIST_KEYS.rightPanelprocesses,
        visible: hasUpperContent,
        expanded: upperExpanded,
        content: <ProcessListContainer />,
      });
      break;
    case RIGHT_MAIN_PANEL_MODES.PREVIEW:
      sections.unshift({
        title: 'Preview',
        persistKey: PERSIST_KEYS.rightPanelPreview,
        visible: hasUpperContent,
        expanded: upperExpanded,
        content: <PreviewControlsContainer attemptId={selectedWorkspace?.id} />,
      });
      break;
    case null:
      break;
  }

  return (
    <div className="h-full border-l bg-secondary overflow-y-auto">
      <div className="divide-y border-b">
        {sections.map((section) => {
          return (
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
          );
        })}
      </div>
    </div>
  );
}
