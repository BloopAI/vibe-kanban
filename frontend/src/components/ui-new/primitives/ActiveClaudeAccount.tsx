import { useQuery } from '@tanstack/react-query';
import { claudeAccountsApi } from '@/lib/api';

/**
 * Simple component that displays the currently active Claude account name.
 * Self-contained - fetches its own data.
 */
export function ActiveClaudeAccount() {
  const { data: accountsData, isLoading, error } = useQuery({
    queryKey: ['claude-accounts'],
    queryFn: claudeAccountsApi.list,
    refetchInterval: 10000,
  });

  // Always show something to verify component is mounted
  if (isLoading) {
    return (
      <span className="text-xs text-white px-2 py-1 bg-blue-500 rounded-full font-bold">
        Loading...
      </span>
    );
  }

  if (error) {
    return (
      <span className="text-xs text-white px-2 py-1 bg-red-500 rounded-full font-bold">
        Error!
      </span>
    );
  }

  if (!accountsData?.rotation_enabled) {
    return (
      <span className="text-xs text-white px-2 py-1 bg-gray-500 rounded-full font-bold">
        Rotation Off
      </span>
    );
  }

  // Find the current account name
  let accountName: string | null = null;
  if (accountsData?.current_account_id) {
    const activeAccount = accountsData.accounts.find(
      (a) => a.id === accountsData.current_account_id
    );
    accountName = activeAccount?.name || null;
  } else if (accountsData?.accounts?.length > 0) {
    accountName = accountsData.accounts[0].name;
  }

  if (!accountName) {
    return (
      <span className="text-xs text-white px-2 py-1 bg-yellow-500 rounded-full font-bold">
        No Account
      </span>
    );
  }

  return (
    <span
      className="text-xs text-white px-2 py-1 bg-green-500 rounded-full font-bold"
      title="Active Claude Account"
    >
      {accountName}
    </span>
  );
}
