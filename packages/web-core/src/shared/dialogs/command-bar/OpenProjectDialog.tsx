import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from '@tanstack/react-router';
import { create, useModal } from '@ebay/nice-modal-react';
import { defineModal, type NoProps } from '@/shared/lib/modals';
import { useAllOrganizationProjects } from '@/shared/hooks/useAllOrganizationProjects';
import { useUserOrganizations } from '@/shared/hooks/useUserOrganizations';
import { useOrganizationStore } from '@/shared/stores/useOrganizationStore';
import { toProject } from '@/shared/lib/routes/navigation';
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@vibe/ui/components/Command';

function OpenProjectDialogContent() {
  const modal = useModal();
  const navigate = useNavigate();
  const location = useLocation();
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [search, setSearch] = useState('');
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);
  const { data: projects, isLoading } = useAllOrganizationProjects();
  const { data: organizationsData } = useUserOrganizations();

  const currentProjectId = location.pathname.startsWith('/projects/')
    ? location.pathname.split('/')[2]
    : null;

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of organizationsData?.organizations ?? []) {
      map.set(org.id, org.name);
    }
    return map;
  }, [organizationsData?.organizations]);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const orgA = orgNameById.get(a.organization_id) ?? '';
        const orgB = orgNameById.get(b.organization_id) ?? '';
        if (orgA !== orgB) return orgA.localeCompare(orgB);
        return a.name.localeCompare(b.name);
      }),
    [projects, orgNameById]
  );

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedProjects;
    return sortedProjects.filter((project) => {
      const orgName = orgNameById.get(project.organization_id) ?? '';
      return (
        project.name.toLowerCase().includes(query) ||
        orgName.toLowerCase().includes(query)
      );
    });
  }, [search, sortedProjects, orgNameById]);

  useEffect(() => {
    if (modal.visible) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setSearch('');
    }
  }, [modal.visible]);

  const handleOpenProject = useCallback(
    (projectId: string, organizationId: string) => {
      setSelectedOrgId(organizationId);
      navigate(toProject(projectId));
      modal.resolve();
      modal.hide();
    },
    [modal, navigate, setSelectedOrgId]
  );

  const handleCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    previousFocusRef.current?.focus();
  }, []);

  const handleOpenAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  return (
    <CommandDialog
      open={modal.visible}
      onOpenChange={(open) => !open && modal.hide()}
      onCloseAutoFocus={handleCloseAutoFocus}
      onOpenAutoFocus={handleOpenAutoFocus}
    >
      <Command
        className="rounded-sm border border-border [&_[cmdk-group-heading]]:px-base [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-low [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-half [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-base [&_[cmdk-item]]:py-half"
        loop
      >
        <div className="flex items-center border-b border-border">
          <CommandInput
            placeholder="Open project..."
            value={search}
            onValueChange={setSearch}
          />
        </div>
        <CommandList className="min-h-[200px]">
          <CommandEmpty>
            {isLoading ? 'Loading projects...' : 'No projects found'}
          </CommandEmpty>
          <CommandGroup heading="Projects">
            {filteredProjects.map((project) => {
              const orgName = orgNameById.get(project.organization_id) ?? '';
              return (
                <CommandItem
                  key={project.id}
                  value={`${project.name} ${orgName}`}
                  onSelect={() =>
                    handleOpenProject(project.id, project.organization_id)
                  }
                  className="flex items-center justify-between"
                >
                  <span className="truncate">{project.name}</span>
                  <span className="ml-base text-low text-xs truncate">
                    {currentProjectId === project.id
                      ? 'Current'
                      : orgName || 'Organization'}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

const OpenProjectDialogImpl = create<NoProps>(() => <OpenProjectDialogContent />);

export const OpenProjectDialog = defineModal<void, void>(OpenProjectDialogImpl);
