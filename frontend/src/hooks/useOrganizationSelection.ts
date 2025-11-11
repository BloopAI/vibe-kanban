import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUserSystem } from '@/components/config-provider';
import type {
  OrganizationWithRole,
  ListOrganizationsResponse,
} from 'shared/types';

interface UseOrganizationSelectionOptions {
  organizations: ListOrganizationsResponse | undefined;
  onSelectionChange?: () => void;
}

/**
 * Hook to manage organization selection with URL synchronization
 */
export function useOrganizationSelection(
  options: UseOrganizationSelectionOptions
) {
  const { organizations, onSelectionChange } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const { loginStatus } = useUserSystem();
  const orgIdParam = searchParams.get('orgId') ?? '';

  const [selectedOrgId, setSelectedOrgId] = useState<string>(
    searchParams.get('orgId') || ''
  );
  const [selectedOrg, setSelectedOrg] = useState<OrganizationWithRole | null>(
    null
  );

  // Default to current org if no selection
  useEffect(() => {
    if (!selectedOrgId && loginStatus?.status === 'loggedin') {
      const currentOrgId = loginStatus.profile.organization_id;
      if (currentOrgId) {
        setSelectedOrgId(currentOrgId);
        setSearchParams({ orgId: currentOrgId });
      }
    }
  }, [selectedOrgId, loginStatus, setSearchParams]);

  // Sync selectedOrgId when URL changes
  useEffect(() => {
    if (orgIdParam && orgIdParam !== selectedOrgId) {
      setSelectedOrgId(orgIdParam);
    }
  }, [orgIdParam, selectedOrgId]);

  // Update selected organization from list
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
        setSearchParams({ orgId: id });
      } else {
        setSearchParams({});
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
