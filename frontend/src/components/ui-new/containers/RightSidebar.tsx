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
} from '@/stores/useUiPreferencesStore';
import { cn } from '@/lib/utils';

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
  const [changesExpanded] = usePersistedExpanded(PERSIST_KEYS.changesSection, true);
  const [processesExpanded] = usePersistedExpanded(PERSIST_KEYS.processesSection, true);
  const [devServerExpanded] = usePersistedExpanded(PERSIST_KEYS.devServerSection, true);
  const [gitExpanded] = usePersistedExpanded(PERSIST_KEYS.gitPanelRepositories, true);
  const [terminalExpanded] = usePersistedExpanded(PERSIST_KEYS.terminalSection, true);

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
    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES) return changesExpanded;
    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS) return processesExpanded;
    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW) return devServerExpanded;
    return false;
  };

  const upperExpanded = getUpperExpanded();

  // Build list of sections and their expanded states
  type SectionId = 'upper' | 'git' | 'terminal';
  const sections: { id: SectionId; visible: boolean; expanded: boolean }[] = [
    { id: 'upper', visible: hasUpperContent, expanded: upperExpanded },
    { id: 'git', visible: true, expanded: gitExpanded },
    { id: 'terminal', visible: isTerminalVisible, expanded: terminalExpanded },
  ];

  const visibleSections = sections.filter((s) => s.visible);
  const expandedSections = visibleSections.filter((s) => s.expanded);
  const collapsedSections = visibleSections.filter((s) => !s.expanded);

  // Render upper content based on mode
  const renderUpperContent = () => {
    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES) {
      return (
        <FileTreeContainer
          key={selectedWorkspace?.id}
          workspaceId={selectedWorkspace?.id}
          diffs={diffs}
          onSelectFile={(path) => {
            selectFile(path);
            setExpanded(`diff:${path}`, true);
          }}
        />
      );
    }
    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS) {
      return <ProcessListContainer />;
    }
    if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW) {
      return <PreviewControlsContainer attemptId={selectedWorkspace?.id} />;
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full border-l">
      {/* Expanded sections take available space */}
      {expandedSections.length > 0 && (
        <div className="flex-1 flex flex-col min-h-0">
          {expandedSections.map((section) => {
            if (section.id === 'upper') {
              return (
                <div key="upper" className="flex-1 min-h-0 overflow-hidden">
                  {renderUpperContent()}
                </div>
              );
            }
            if (section.id === 'git') {
              return (
                <div key="git" className="flex-1 min-h-0 overflow-hidden">
                  <GitPanelContainer
                    selectedWorkspace={selectedWorkspace}
                    repos={repos}
                    diffs={diffs}
                  />
                </div>
              );
            }
            if (section.id === 'terminal') {
              return (
                <div
                  key="terminal"
                  className="flex-1 min-h-0 overflow-hidden"
                  style={{ minHeight: 150 }}
                >
                  <TerminalPanelContainer />
                </div>
              );
            }
            return null;
          })}
        </div>
      )}

      {/* Collapsed sections stack at bottom */}
      {collapsedSections.length > 0 && (
        <div
          className={cn(
            'flex flex-col flex-shrink-0',
            expandedSections.length === 0 && 'mt-auto'
          )}
        >
          {collapsedSections.map((section) => {
            if (section.id === 'upper') {
              return (
                <div key="upper" className="flex-shrink-0">
                  {renderUpperContent()}
                </div>
              );
            }
            if (section.id === 'git') {
              return (
                <div key="git" className="flex-shrink-0">
                  <GitPanelContainer
                    selectedWorkspace={selectedWorkspace}
                    repos={repos}
                    diffs={diffs}
                  />
                </div>
              );
            }
            if (section.id === 'terminal') {
              return (
                <div key="terminal" className="flex-shrink-0">
                  <TerminalPanelContainer />
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}
