import { GitPanelCreateContainer } from '@/components/ui-new/containers/GitPanelCreateContainer';
import { FileTreeContainer } from '@/components/ui-new/containers/FileTreeContainer';
import { ProcessListContainer } from '@/components/ui-new/containers/ProcessListContainer';
import { PreviewControlsContainer } from '@/components/ui-new/containers/PreviewControlsContainer';
import { GitPanelContainer } from '@/components/ui-new/containers/GitPanelContainer';
import { useChangesView } from '@/contexts/ChangesViewContext';
import { useLogsPanel } from '@/contexts/LogsPanelContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import type { Workspace, RepoWithTargetBranch } from 'shared/types';
import {
  RIGHT_MAIN_PANEL_MODES,
  type RightMainPanelMode,
  useExpandedAll,
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
  const { viewProcessInPanel } = useLogsPanel();
  const { diffs } = useWorkspaceContext();
  const { setExpanded } = useExpandedAll();

  if (isCreateMode) {
    return <GitPanelCreateContainer />;
  }

  if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.CHANGES) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-[7] min-h-0 overflow-hidden">
          <FileTreeContainer
            key={selectedWorkspace?.id}
            workspaceId={selectedWorkspace?.id}
            diffs={diffs}
            onSelectFile={(path) => {
              selectFile(path);
              setExpanded(`diff:${path}`, true);
            }}
          />
        </div>
        <div className="flex-[3] min-h-0 overflow-hidden">
          <GitPanelContainer
            selectedWorkspace={selectedWorkspace}
            repos={repos}
            diffs={diffs}
          />
        </div>
      </div>
    );
  }

  if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-[7] min-h-0 overflow-hidden">
          <ProcessListContainer />
        </div>
        <div className="flex-[3] min-h-0 overflow-hidden">
          <GitPanelContainer
            selectedWorkspace={selectedWorkspace}
            repos={repos}
            diffs={diffs}
          />
        </div>
      </div>
    );
  }

  if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.PREVIEW) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-[7] min-h-0 overflow-hidden">
          <PreviewControlsContainer
            attemptId={selectedWorkspace?.id}
            onViewProcessInPanel={viewProcessInPanel}
          />
        </div>
        <div className="flex-[3] min-h-0 overflow-hidden">
          <GitPanelContainer
            selectedWorkspace={selectedWorkspace}
            repos={repos}
            diffs={diffs}
          />
        </div>
      </div>
    );
  }

  return (
    <GitPanelContainer
      selectedWorkspace={selectedWorkspace}
      repos={repos}
      diffs={diffs}
    />
  );
}
