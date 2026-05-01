import { useState, useEffect, useCallback } from "react";
import { ExportPage as ExportPageUI } from "@/pages/export/ExportPage";
import {
  authenticatedFetch,
  listOrganizations,
  listOrganizationProjects,
} from "@remote/shared/lib/api";
import type { ExportRequest } from "@/features/export/ui/ExportDownload";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export default function ExportPage() {
  const [organizations, setOrganizations] = useState<
    { id: string; name: string }[]
  >([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  // Fetch organizations on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchOrgs() {
      try {
        const data = await listOrganizations();
        if (!cancelled) {
          const orgs = data.organizations.map((o) => ({
            id: o.id,
            name: o.name,
          }));
          setOrganizations(orgs);
          if (orgs.length > 0) {
            setSelectedOrgId(orgs[0].id);
          }
        }
      } finally {
        if (!cancelled) setOrgsLoading(false);
      }
    }
    void fetchOrgs();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch projects when org changes
  useEffect(() => {
    if (!selectedOrgId) return;
    let cancelled = false;
    async function fetchProjects() {
      setProjectsLoading(true);
      try {
        const data = await listOrganizationProjects(selectedOrgId!);
        if (!cancelled) {
          setProjects(data.map((p) => ({ id: p.id, name: p.name })));
        }
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    }
    void fetchProjects();
    return () => {
      cancelled = true;
    };
  }, [selectedOrgId]);

  const exportFn = useCallback(async (request: ExportRequest) => {
    return authenticatedFetch(`${API_BASE}/v1/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  }, []);

  return (
    <ExportPageUI
      exportFn={exportFn}
      organizations={organizations}
      orgsLoading={orgsLoading}
      projects={projects}
      projectsLoading={projectsLoading}
      selectedOrgId={selectedOrgId}
      onOrgChange={setSelectedOrgId}
    />
  );
}
