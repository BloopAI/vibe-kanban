import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  OrganizationWithRole,
  ListOrganizationsResponse,
} from 'shared/types';

interface UseOrganizationSelectionOptions {
  organizations: ListOrganizationsResponse | undefined;
  onSelectionChange?: () => void;
}
export function useOrganizationSelection(
  options: UseOrganizationSelectionOptions
) {
  const { organizations, onSelectionChange } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const orgIdParam = searchParams.get('orgId') ?? '';

  const [selectedOrgId, setSelectedOrgId] = useState<string>(
    searchParams.get('orgId') || ''
  );
  const [selectedOrg, setSelectedOrg] = useState<OrganizationWithRole | null>(
    null
  );

  // Sync selectedOrgId when URL changes
  useEffect(() => {
    if (orgIdParam && orgIdParam !== selectedOrgId) {
      setSelectedOrgId(orgIdParam);
    }
  }, [orgIdParam, selectedOrgId]);

  // Default to first available organization if none selected
  useEffect(() => {
    const orgList = organizations?.organizations ?? [];
    if (orgList.length === 0) {
      return;
    }

    const hasSelection = selectedOrgId
      ? orgList.some((org) => org.id === selectedOrgId)
      : false;

    if (!selectedOrgId || !hasSelection) {
      // Prefer first non-personal org, fallback to first org if all are personal
      const firstNonPersonal = orgList.find((org) => !org.is_personal);
      const fallbackId = (firstNonPersonal ?? orgList[0]).id;
      setSelectedOrgId(fallbackId);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('orgId', fallbackId);
        return next;
      });
    }
  }, [organizations, selectedOrgId, setSearchParams]);

  useEffect(() => {
    if (!organizations?.organizations) return;

    const nextOrg = selectedOrgId
      ? organizations.organizations.find((o) => o.id === selectedOrgId)
      : null;

    setSelectedOrg(nextOrg ?? null);
  }, [organizations, selectedOrgId]);

  // Handle organization selection from dropdown
  const handleOrgSelect = useCallback(
    (id: string) => {
      if (id === selectedOrgId) return;

      setSelectedOrgId(id);
      if (id) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set('orgId', id);
          return next;
        });
      } else {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('orgId');
          return next;
        });
      }
      onSelectionChange?.();
    },
    [selectedOrgId, setSearchParams, onSelectionChange]
  );

  return {
    selectedOrgId,
    selectedOrg,
    handleOrgSelect,
  };
}
