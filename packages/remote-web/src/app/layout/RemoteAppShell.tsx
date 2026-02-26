import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { siDiscord, siGithub } from "simple-icons";
import { AppBar, type AppBarHostStatus } from "@vibe/ui/components/AppBar";
import type { Project } from "shared/remote-types";
import { useUserOrganizations } from "@/shared/hooks/useUserOrganizations";
import { useAuth } from "@/shared/hooks/auth/useAuth";
import { useOrganizationStore } from "@/shared/stores/useOrganizationStore";
import { useDiscordOnlineCount } from "@/shared/hooks/useDiscordOnlineCount";
import { useGitHubStars } from "@/shared/hooks/useGitHubStars";
import { SettingsDialog } from "@/shared/dialogs/settings/SettingsDialog";
import { listOrganizationProjects } from "@remote/shared/lib/api";
import { RemoteAppBarUserPopoverContainer } from "@remote/app/layout/RemoteAppBarUserPopoverContainer";
import { RemoteNavbarContainer } from "@remote/app/layout/RemoteNavbarContainer";
import { useRelayAppBarHosts } from "@remote/shared/hooks/useRelayAppBarHosts";
import { REMOTE_SETTINGS_SECTIONS } from "@remote/shared/constants/settings";
import {
  CreateOrganizationDialog,
  type CreateOrganizationResult,
} from "@/shared/dialogs/org/CreateOrganizationDialog";
import {
  CreateRemoteProjectDialog,
  type CreateRemoteProjectResult,
} from "@/shared/dialogs/org/CreateRemoteProjectDialog";
import {
  getActiveRelayHostId,
  parseRelayHostIdFromSearch,
  setActiveRelayHostId,
} from "@remote/shared/lib/activeRelayHost";

interface RemoteAppShellProps {
  children: ReactNode;
}

export function RemoteAppShell({ children }: RemoteAppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isSignedIn } = useAuth();

  const { data: organizationsData } = useUserOrganizations();
  const organizations = organizationsData?.organizations ?? [];
  const selectedOrgId = useOrganizationStore((s) => s.selectedOrgId);
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);

  useEffect(() => {
    if (organizations.length === 0) {
      return;
    }

    const hasValidSelection = selectedOrgId
      ? organizations.some((organization) => organization.id === selectedOrgId)
      : false;

    if (!hasValidSelection) {
      const firstOrg = organizations.find(
        (organization) => !organization.is_personal,
      );
      setSelectedOrgId((firstOrg ?? organizations[0]).id);
    }
  }, [organizations, selectedOrgId, setSelectedOrgId]);

  const activeOrganizationId = useMemo(() => {
    if (!selectedOrgId) {
      return organizations[0]?.id ?? null;
    }

    const isSelectedOrgAvailable = organizations.some(
      (organization) => organization.id === selectedOrgId,
    );

    if (!isSelectedOrgAvailable) {
      return organizations[0]?.id ?? null;
    }

    return selectedOrgId;
  }, [organizations, selectedOrgId]);

  const projectsQuery = useQuery({
    queryKey: ["remote-app-shell", "projects", activeOrganizationId],
    queryFn: async (): Promise<Project[]> => {
      if (!activeOrganizationId) {
        return [];
      }

      const projects = await listOrganizationProjects(activeOrganizationId);
      return [...projects].sort((a, b) => a.sort_order - b.sort_order);
    },
    enabled: isSignedIn && !!activeOrganizationId,
    staleTime: 30_000,
  });

  const projects = projectsQuery.data ?? [];
  const isLoadingProjects =
    isSignedIn && !!activeOrganizationId && projectsQuery.isLoading;

  const { data: onlineCount } = useDiscordOnlineCount();
  const { data: starCount } = useGitHubStars();
  const { hosts: relayHosts } = useRelayAppBarHosts(isSignedIn);

  const selectedOrgName =
    organizations.find((organization) => organization.id === selectedOrgId)
      ?.name ?? null;

  const isWorkspacesActive = location.pathname.startsWith("/workspaces");
  const hostIdFromSearch = useMemo(
    () => parseRelayHostIdFromSearch(location.searchStr),
    [location.searchStr],
  );

  useEffect(() => {
    if (hostIdFromSearch) {
      setActiveRelayHostId(hostIdFromSearch);
    }
  }, [hostIdFromSearch]);

  const activeHostId = useMemo(() => {
    if (!isWorkspacesActive) {
      return null;
    }

    return hostIdFromSearch ?? getActiveRelayHostId();
  }, [hostIdFromSearch, isWorkspacesActive]);

  const activeProjectId = location.pathname.startsWith("/projects/")
    ? (location.pathname.split("/")[2] ?? null)
    : null;

  const handleWorkspacesClick = useCallback(() => {
    const currentHostId = getActiveRelayHostId();
    if (currentHostId) {
      navigate({ to: "/workspaces", search: { hostId: currentHostId } });
      return;
    }

    navigate({ to: "/workspaces" });
  }, [navigate]);

  const handleProjectClick = useCallback(
    (projectId: string) => {
      navigate({
        to: "/projects/$projectId",
        params: { projectId },
      });
    },
    [navigate],
  );

  const handleCreateProject = useCallback(async () => {
    if (!activeOrganizationId) {
      return;
    }

    try {
      const result: CreateRemoteProjectResult =
        await CreateRemoteProjectDialog.show({
          organizationId: activeOrganizationId,
        });

      if (result.action === "created" && result.project) {
        void projectsQuery.refetch();
        navigate({
          to: "/projects/$projectId",
          params: { projectId: result.project.id },
        });
      }
    } catch {
      // Dialog cancelled
    }
  }, [activeOrganizationId, navigate, projectsQuery]);

  const handleCreateOrg = useCallback(async () => {
    try {
      const result: CreateOrganizationResult =
        await CreateOrganizationDialog.show();

      if (result.action === "created" && result.organizationId) {
        setSelectedOrgId(result.organizationId);
      }
    } catch {
      // Dialog cancelled
    }
  }, [setSelectedOrgId]);

  const handleHostClick = useCallback(
    (hostId: string, status: AppBarHostStatus) => {
      if (status === "online") {
        setActiveRelayHostId(hostId);
        navigate({
          to: "/workspaces",
          search: { hostId },
        });
        return;
      }

      if (status !== "unpaired") {
        return;
      }

      void SettingsDialog.show({
        initialSection: "relay",
        initialState: { hostId },
        sections: REMOTE_SETTINGS_SECTIONS,
      });
    },
    [navigate],
  );

  return (
    <div className="flex h-screen bg-primary">
      <AppBar
        projects={projects}
        hosts={relayHosts}
        activeHostId={activeHostId}
        onCreateProject={handleCreateProject}
        onWorkspacesClick={handleWorkspacesClick}
        onHostClick={handleHostClick}
        showWorkspacesButton={false}
        onProjectClick={handleProjectClick}
        onProjectsDragEnd={() => {}}
        isSavingProjectOrder={true}
        isWorkspacesActive={isWorkspacesActive}
        activeProjectId={activeProjectId}
        isSignedIn={isSignedIn}
        isLoadingProjects={isLoadingProjects}
        onSignIn={() => {
          navigate({ to: "/account" });
        }}
        userPopover={
          <RemoteAppBarUserPopoverContainer
            organizations={organizations}
            selectedOrgId={selectedOrgId ?? ""}
            onOrgSelect={setSelectedOrgId}
            onCreateOrg={handleCreateOrg}
          />
        }
        starCount={starCount}
        onlineCount={onlineCount}
        githubIconPath={siGithub.path}
        discordIconPath={siDiscord.path}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <RemoteNavbarContainer organizationName={selectedOrgName} />
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
