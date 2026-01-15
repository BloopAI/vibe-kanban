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
  type RightMainPanelMode,
  useExpandedAll,
  useUiPreferencesStore,
} from '@/stores/useUiPreferencesStore';

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

  if (isCreateMode) {
    return <GitPanelCreateContainer />;
  }

  // Determine if we have upper content based on mode
  const hasUpperContent =
    rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES ||
    rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS ||
    rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW;

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

  // Calculate flex ratios based on what's visible
  const getGitPanelFlex = () => {
    if (hasUpperContent && isTerminalVisible) return 'flex-[2]';
    if (hasUpperContent || isTerminalVisible) return 'flex-[3]';
    return 'flex-1';
  };

  const getTerminalFlex = () => {
    if (hasUpperContent) return 'flex-[4]';
    return 'flex-[7]';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Upper section - mode-specific content */}
      {hasUpperContent && (
        <div className="flex-[4] min-h-0 overflow-hidden">
          {renderUpperContent()}
        </div>
      )}

      {/* Middle section - Git panel */}
      <div className={`${getGitPanelFlex()} min-h-0 overflow-hidden`}>
        <GitPanelContainer
          selectedWorkspace={selectedWorkspace}
          repos={repos}
          diffs={diffs}
        />
      </div>

      {/* Lower section - Terminal (collapsible) */}
      {isTerminalVisible && (
        <div
          className={`${getTerminalFlex()} min-h-0 overflow-hidden`}
          style={{ minHeight: 150 }}
        >
          <TerminalPanelContainer />
        </div>
      )}
    </div>
  );
}
