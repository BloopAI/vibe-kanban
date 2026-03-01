import { useCallback } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useOrganizationStore } from '@/shared/stores/useOrganizationStore';
import { CreateRemoteProjectDialog } from '@/shared/dialogs/org/CreateRemoteProjectDialog';
import { OpenProjectDialog } from '@/shared/dialogs/command-bar/OpenProjectDialog';
import { toProject } from '@/shared/lib/routes/navigation';
import { Scope } from '@/shared/keyboard/registry';

const SEQUENCE_TIMEOUT_MS = 1500;

const OPTIONS = {
  scopes: [Scope.WORKSPACE, Scope.KANBAN, Scope.PROJECTS],
  sequenceTimeout: SEQUENCE_TIMEOUT_MS,
} as const;

export function useProjectShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedOrgId = useOrganizationStore((s) => s.selectedOrgId);
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);

  const handleCreateProject = useCallback(async () => {
    if (!selectedOrgId) return;
    const result = await CreateRemoteProjectDialog.show({
      organizationId: selectedOrgId,
    });
    if (result.action === 'created' && result.project) {
      setSelectedOrgId(result.project.organization_id);
      navigate(toProject(result.project.id));
    }
  }, [navigate, selectedOrgId, setSelectedOrgId]);

  const handleOpenProject = useCallback(async () => {
    await OpenProjectDialog.show();
  }, []);

  const isInsideApp =
    location.pathname.startsWith('/projects') ||
    location.pathname.startsWith('/workspaces');

  useHotkeys('g>c', () => void handleCreateProject(), {
    ...OPTIONS,
    enabled: isInsideApp,
  });
  useHotkeys('g>p', () => void handleOpenProject(), {
    ...OPTIONS,
    enabled: isInsideApp,
  });
}
