import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { Project } from "shared/remote-types";
import type { OrganizationWithRole } from "shared/types";
import { listOrganizationProjects } from "@remote/shared/lib/api";
import { clearTokens } from "@remote/shared/lib/auth";
import { SettingsDialog } from "@/shared/dialogs/settings/SettingsDialog";
import { useOrganizationStore } from "@/shared/stores/useOrganizationStore";
import { useUserOrganizations } from "@/shared/hooks/useUserOrganizations";
import { REMOTE_SETTINGS_SECTIONS } from "@remote/shared/constants/settings";

type OrganizationWithProjects = {
  organization: OrganizationWithRole;
  projects: Project[];
};

export default function HomePage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/" });
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);
  const {
    data: orgsResponse,
    isLoading: orgsLoading,
    error: orgsError,
  } = useUserOrganizations();
  const organizations = orgsResponse?.organizations;
  const [items, setItems] = useState<OrganizationWithProjects[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const legacyOrgId = search.legacyOrgSettingsOrgId;
    if (!legacyOrgId) {
      return;
    }

    setSelectedOrgId(legacyOrgId);
    navigate({
      to: "/",
      search: {},
      replace: true,
    });

    void SettingsDialog.show({
      initialSection: "organizations",
      initialState: { organizationId: legacyOrgId },
      sections: REMOTE_SETTINGS_SECTIONS,
    });
  }, [navigate, search.legacyOrgSettingsOrgId, setSelectedOrgId]);

  const handleSignInAgain = async () => {
    await clearTokens();
    navigate({
      to: "/account",
      replace: true,
    });
  };

  useEffect(() => {
    if (!organizations) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoadingProjects(true);
      setError(null);

      try {
        const organizationsWithProjects = await Promise.all(
          organizations.map(async (organization) => {
            const projects = await listOrganizationProjects(organization.id);
            return {
              organization,
              projects: projects.sort((a, b) => a.sort_order - b.sort_order),
            };
          }),
        );

        if (!cancelled) {
          setItems(organizationsWithProjects);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load organizations",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProjects(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [organizations]);

  const loading = orgsLoading || isLoadingProjects;
  const displayError =
    error ??
    (orgsError
      ? orgsError instanceof Error
        ? orgsError.message
        : "Failed to load organizations"
      : null);

  if (loading) {
    return (
      <CenteredCard>
        <h1 className="text-lg font-semibold text-high">Organizations</h1>
        <p className="mt-base text-sm text-normal">
          Loading organizations and projects...
        </p>
      </CenteredCard>
    );
  }

  if (displayError) {
    return (
      <CenteredCard>
        <h1 className="text-lg font-semibold text-high">Failed to load</h1>
        <p className="mt-base text-sm text-normal">{displayError}</p>
        <button
          type="button"
          className="mt-double rounded-sm bg-brand px-base py-half text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
          onClick={() => {
            void handleSignInAgain();
          }}
        >
          Sign in again
        </button>
      </CenteredCard>
    );
  }

  const organizationCount = items.length;
  const totalProjectCount = items.reduce(
    (count, item) => count + item.projects.length,
    0,
  );

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-6xl px-double py-double">
        <header className="space-y-half">
          <h1 className="text-2xl font-semibold text-high">Organizations</h1>
          <p className="text-sm text-low">
            {organizationCount}{" "}
            {organizationCount === 1 ? "organization" : "organizations"} •{" "}
            {totalProjectCount}{" "}
            {totalProjectCount === 1 ? "project" : "projects"}
          </p>
        </header>

        {organizationCount === 0 ? (
          <section className="mt-double rounded-sm border border-border bg-secondary p-double">
            <h2 className="text-base font-medium text-high">
              No organizations found
            </h2>
            <p className="mt-half text-sm text-low">
              Create or join an organization to start working on projects.
            </p>
          </section>
        ) : (
          <div className="mt-double space-y-double">
            {items.map(({ organization, projects }) => (
              <OrganizationSection
                key={organization.id}
                organization={organization}
                projects={projects}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-base">
      <section className="w-full max-w-md rounded-sm border border-border bg-secondary p-double text-center">
        {children}
      </section>
    </div>
  );
}

function OrganizationSection({
  organization,
  projects,
}: OrganizationWithProjects) {
  return (
    <section className="space-y-base">
      <header className="flex items-center justify-between gap-base">
        <h2 className="truncate text-lg font-medium text-high">
          {organization.name}
        </h2>
        <p className="shrink-0 text-xs text-low">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </p>
      </header>

      {projects.length === 0 ? (
        <div className="rounded-sm border border-border bg-primary px-base py-base text-sm text-low">
          No projects yet
        </div>
      ) : (
        <ul className="grid gap-base sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} />
            </li>
          ))}
          {projects.length % 2 === 1 ? (
            <li className="hidden sm:block" aria-hidden="true">
              <ProjectCardSkeleton />
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const setSelectedOrgId = useOrganizationStore((s) => s.setSelectedOrgId);

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      onClick={() => {
        setSelectedOrgId(project.organization_id);
      }}
      className="group flex h-[61px] flex-col justify-center rounded-sm border border-border bg-primary px-base py-base hover:border-high/20 hover:bg-panel focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
    >
      <p className="text-sm font-medium text-high">{project.name}</p>
      <p className="mt-half text-xs text-low group-hover:text-normal">
        Open project
      </p>
    </Link>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="h-[61px] rounded-sm border border-border bg-primary animate-pulse" />
  );
}
