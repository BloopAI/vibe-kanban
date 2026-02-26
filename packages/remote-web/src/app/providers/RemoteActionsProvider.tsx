import {
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Workspace } from "shared/types";
import {
  ActionsContext,
  type ActionsContextValue,
} from "@/shared/hooks/useActions";
import { UserContext } from "@/shared/hooks/useUserContext";
import {
  type ActionDefinition,
  type ActionExecutorContext,
  type ActionVisibilityContext,
  getActionLabel,
  resolveLabel,
  type ProjectMutations,
} from "@/shared/types/actions";
import { SettingsDialog } from "@/shared/dialogs/settings/SettingsDialog";
import { buildIssueCreatePath } from "@/shared/lib/routes/projectSidebarRoutes";
import { useOrganizationStore } from "@/shared/stores/useOrganizationStore";
import { REMOTE_SETTINGS_SECTIONS } from "@remote/shared/constants/settings";

interface RemoteActionsProviderProps {
  children: ReactNode;
}

function noOpSelection(name: string) {
  console.warn(`[RemoteActionsProvider] ${name} is unavailable in remote web.`);
}

export function RemoteActionsProvider({
  children,
}: RemoteActionsProviderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { projectId } = useParams({ strict: false });
  const userCtx = useContext(UserContext);
  const selectedOrgId = useOrganizationStore((s) => s.selectedOrgId);
  const [defaultCreateStatusId, setDefaultCreateStatusId] = useState<
    string | undefined
  >();
  const [projectMutations, setProjectMutations] =
    useState<ProjectMutations | null>(null);

  const registerProjectMutations = useCallback(
    (mutations: ProjectMutations | null) => {
      setProjectMutations(mutations);
    },
    [],
  );

  const navigateToCreateIssue = useCallback(() => {
    if (!projectId) return;
    navigate(buildIssueCreatePath(projectId));
  }, [navigate, projectId]);

  const openStatusSelection = useCallback(async () => {
    noOpSelection("Status selection");
  }, []);

  const openPrioritySelection = useCallback(async () => {
    noOpSelection("Priority selection");
  }, []);

  const openAssigneeSelection = useCallback(async () => {
    noOpSelection("Assignee selection");
  }, []);

  const openSubIssueSelection = useCallback(async () => {
    noOpSelection("Sub-issue selection");
    return undefined;
  }, []);

  const openWorkspaceSelection = useCallback(async () => {
    noOpSelection("Workspace selection");
  }, []);

  const openRelationshipSelection = useCallback(async () => {
    noOpSelection("Relationship selection");
  }, []);

  const executorContext = useMemo<ActionExecutorContext>(
    () => ({
      navigate,
      queryClient,
      selectWorkspace: () => {
        noOpSelection("Workspace actions");
      },
      activeWorkspaces: [],
      currentWorkspaceId: null,
      containerRef: null,
      runningDevServers: [],
      startDevServer: () => {
        noOpSelection("Dev server actions");
      },
      stopDevServer: () => {
        noOpSelection("Dev server actions");
      },
      currentLogs: null,
      logsPanelContent: null,
      openStatusSelection,
      openPrioritySelection,
      openAssigneeSelection,
      openSubIssueSelection,
      openWorkspaceSelection,
      openRelationshipSelection,
      navigateToCreateIssue,
      defaultCreateStatusId,
      kanbanOrgId: selectedOrgId ?? undefined,
      kanbanProjectId: projectId,
      projectMutations: projectMutations ?? undefined,
      remoteWorkspaces: userCtx?.workspaces ?? [],
    }),
    [
      navigate,
      queryClient,
      openStatusSelection,
      openPrioritySelection,
      openAssigneeSelection,
      openSubIssueSelection,
      openWorkspaceSelection,
      openRelationshipSelection,
      navigateToCreateIssue,
      defaultCreateStatusId,
      selectedOrgId,
      projectId,
      projectMutations,
      userCtx?.workspaces,
    ],
  );

  const executeAction = useCallback(
    async (action: ActionDefinition): Promise<void> => {
      if (action.id === "settings") {
        await SettingsDialog.show({
          initialSection: "organizations",
          sections: REMOTE_SETTINGS_SECTIONS,
        });
        return;
      }

      if (action.id === "project-settings") {
        await SettingsDialog.show({
          initialSection: "remote-projects",
          initialState: {
            organizationId: selectedOrgId ?? undefined,
            projectId: projectId ?? undefined,
          },
          sections: REMOTE_SETTINGS_SECTIONS,
        });
        return;
      }

      console.warn(
        `[RemoteActionsProvider] Action "${action.id}" is unavailable in remote web.`,
      );
    },
    [projectId, selectedOrgId],
  );

  const getLabel = useCallback(
    (
      action: ActionDefinition,
      workspace?: Workspace,
      ctx?: ActionVisibilityContext,
    ) => {
      if (ctx) {
        return getActionLabel(action, ctx, workspace);
      }
      return resolveLabel(action, workspace);
    },
    [],
  );

  const value = useMemo<ActionsContextValue>(
    () => ({
      executeAction,
      getLabel,
      openStatusSelection,
      openPrioritySelection,
      openAssigneeSelection,
      openSubIssueSelection,
      openWorkspaceSelection,
      openRelationshipSelection,
      setDefaultCreateStatusId,
      registerProjectMutations,
      executorContext,
    }),
    [
      executeAction,
      getLabel,
      openStatusSelection,
      openPrioritySelection,
      openAssigneeSelection,
      openSubIssueSelection,
      openWorkspaceSelection,
      openRelationshipSelection,
      registerProjectMutations,
      executorContext,
    ],
  );

  return (
    <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>
  );
}
