import { GitPanelCreateContainer } from '@/components/ui-new/containers/GitPanelCreateContainer';
import { FileTreeContainer } from '@/components/ui-new/containers/FileTreeContainer';
import { ProcessListContainer } from '@/components/ui-new/containers/ProcessListContainer';
import { PreviewControlsContainer } from '@/components/ui-new/containers/PreviewControlsContainer';
import { GitPanelContainer } from '@/components/ui-new/containers/GitPanelContainer';
import { type RepoInfo } from '@/components/ui-new/views/GitPanel';
import { type LogsPanelContent } from '@/components/ui-new/containers/LogsContentContainer';
import { useChangesView } from '@/contexts/ChangesViewContext';
import type { Workspace, RepoWithTargetBranch, Diff } from 'shared/types';
import { RIGHT_MAIN_PANEL_MODES, type RightMainPanelMode } from '@/stores/useUiPreferencesStore';

export interface RightPanelContentProps {
  isCreateMode: boolean;
  rightMainPanelMode: RightMainPanelMode | null;
  selectedWorkspace: Workspace | undefined;
  repos: RepoWithTargetBranch[];
  repoInfos: RepoInfo[];
  realDiffs: Diff[];
  logsPanelContent: LogsPanelContent | null;
  logSearchQuery: string;
  logMatchIndices: number[];
  logCurrentMatchIdx: number;
  onBranchNameChange: (name: string) => void;
  onSetExpanded: (key: string, value: boolean) => void;
  onViewProcessInPanel: (processId: string) => void;
  onSearchQueryChange: (query: string) => void;
  onLogPrevMatch: () => void;
  onLogNextMatch: () => void;
}

export function RightPanelContent({
  isCreateMode,
  rightMainPanelMode,
  selectedWorkspace,
  repos,
  repoInfos,
  realDiffs,
  logsPanelContent,
  logSearchQuery,
  logMatchIndices,
  logCurrentMatchIdx,
  onBranchNameChange,
  onSetExpanded,
  onViewProcessInPanel,
  onSearchQueryChange,
  onLogPrevMatch,
  onLogNextMatch,
}: RightPanelContentProps) {
  const { selectFile } = useChangesView();
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
            diffs={realDiffs}
            onSelectFile={(path) => {
              selectFile(path);
              onSetExpanded(`diff:${path}`, true);
            }}
          />
        </div>
        <div className="flex-[3] min-h-0 overflow-hidden">
          <GitPanelContainer
            selectedWorkspace={selectedWorkspace}
            repos={repos}
            repoInfos={repoInfos}
            onBranchNameChange={onBranchNameChange}
          />
        </div>
      </div>
    );
  }

  if (rightMainPanelMode === RIGHT_MAIN_PANEL_MODES.LOGS) {
    const selectedProcessId =
      logsPanelContent?.type === 'process' ? logsPanelContent.processId : null;
    return (
      <div className="flex flex-col h-full">
        <div className="flex-[7] min-h-0 overflow-hidden">
          <ProcessListContainer
            selectedProcessId={selectedProcessId}
            onSelectProcess={onViewProcessInPanel}
            disableAutoSelect={logsPanelContent?.type === 'tool'}
            searchQuery={logSearchQuery}
            onSearchQueryChange={onSearchQueryChange}
            matchCount={logMatchIndices.length}
            currentMatchIdx={logCurrentMatchIdx}
            onPrevMatch={onLogPrevMatch}
            onNextMatch={onLogNextMatch}
          />
        </div>
        <div className="flex-[3] min-h-0 overflow-hidden">
          <GitPanelContainer
            selectedWorkspace={selectedWorkspace}
            repos={repos}
            repoInfos={repoInfos}
            onBranchNameChange={onBranchNameChange}
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
            onViewProcessInPanel={onViewProcessInPanel}
          />
        </div>
        <div className="flex-[3] min-h-0 overflow-hidden">
          <GitPanelContainer
            selectedWorkspace={selectedWorkspace}
            repos={repos}
            repoInfos={repoInfos}
            onBranchNameChange={onBranchNameChange}
          />
        </div>
      </div>
    );
  }

  return (
    <GitPanelContainer
      selectedWorkspace={selectedWorkspace}
      repos={repos}
      repoInfos={repoInfos}
      onBranchNameChange={onBranchNameChange}
    />
  );
}
