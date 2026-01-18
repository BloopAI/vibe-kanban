import { useEffect, useRef } from 'react';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useTerminal } from '@/contexts/TerminalContext';
import { TerminalPanel } from '../views/TerminalPanel';

export function TerminalPanelContainer() {
  const { workspace } = useWorkspaceContext();
  const {
    getTabsForWorkspace,
    getActiveTab,
    createTab,
    closeTab,
    setActiveTab,
    clearWorkspaceTabs,
  } = useTerminal();

  const workspaceId = workspace?.id;
  const containerRef = workspace?.container_ref ?? null;
  const tabs = workspaceId ? getTabsForWorkspace(workspaceId) : [];
  const activeTab = workspaceId ? getActiveTab(workspaceId) : null;

  const creatingRef = useRef(false);
  const prevWorkspaceIdRef = useRef<string | null>(null);

  // Clean up terminals when workspace changes
  useEffect(() => {
    if (
      prevWorkspaceIdRef.current &&
      prevWorkspaceIdRef.current !== workspaceId
    ) {
      clearWorkspaceTabs(prevWorkspaceIdRef.current);
    }
    prevWorkspaceIdRef.current = workspaceId ?? null;
  }, [workspaceId, clearWorkspaceTabs]);

  // Auto-create first tab when workspace is selected and terminal mode is active
  useEffect(() => {
    if (
      workspaceId &&
      containerRef &&
      tabs.length === 0 &&
      !creatingRef.current
    ) {
      creatingRef.current = true;
      createTab(workspaceId, containerRef);
    }
    if (tabs.length > 0) {
      creatingRef.current = false;
    }
  }, [workspaceId, containerRef, tabs.length, createTab]);

  return (
    <TerminalPanel
      tabs={tabs}
      activeTabId={activeTab?.id ?? null}
      workspaceId={workspaceId ?? ''}
      containerRef={containerRef}
      onTabSelect={(tabId) => workspaceId && setActiveTab(workspaceId, tabId)}
      onTabClose={(tabId) => workspaceId && closeTab(workspaceId, tabId)}
      onNewTab={() =>
        workspaceId && containerRef && createTab(workspaceId, containerRef)
      }
    />
  );
}
