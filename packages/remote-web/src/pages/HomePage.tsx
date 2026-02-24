import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { Project } from "shared/remote-types";
import type { OrganizationWithRole } from "shared/types";
import {
  listOrganizationProjects,
  listOrganizations,
} from "@remote/shared/lib/api";
import { clearTokens } from "@remote/shared/lib/auth";

type OrganizationWithProjects = {
  organization: OrganizationWithRole;
  projects: Project[];
};

export default function HomePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<OrganizationWithProjects[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSignInAgain = async () => {
    await clearTokens();
    navigate({
      to: "/account",
      replace: true,
    });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { organizations } = await listOrganizations();

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
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-normal">Loading organizations and projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-high">Failed to load</h1>
          <p className="mt-base text-normal">{error}</p>
          <button
            type="button"
            className="mt-double rounded-sm bg-brand px-base py-half text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
            onClick={() => {
              void handleSignInAgain();
            }}
          >
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-auto px-double py-double">
      <h1 className="text-2xl font-semibold text-high">Organizations</h1>

      <div className="mt-double space-y-double">
        {items.map(({ organization, projects }) => (
          <section
            key={organization.id}
            className="rounded-sm border border-border bg-secondary p-double"
          >
            <h2 className="text-lg font-medium text-high">
              {organization.name}
            </h2>
            {projects.length === 0 ? (
              <p className="mt-base text-sm text-low">No projects yet</p>
            ) : (
              <ul className="mt-base space-y-half">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="block rounded-sm border border-border px-base py-half text-normal hover:bg-panel hover:text-high"
                    >
                      {project.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
