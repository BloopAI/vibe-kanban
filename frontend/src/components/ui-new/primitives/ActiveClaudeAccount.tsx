import { useQuery } from '@tanstack/react-query';
import { claudeAccountsApi } from '@/lib/api';

/**
 * Simple component that displays the currently active Claude account name.
 * Self-contained - fetches its own data.
 */
export function ActiveClaudeAccount() {
  const { data: accountsData } = useQuery({
    queryKey: ['claude-accounts'],
    queryFn: claudeAccountsApi.list,
    refetchInterval: 10000,
  });

  // Only show when rotation is enabled
  if (!accountsData?.rotation_enabled) {
    return null;
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
    return null;
  }

  return (
    <span
      className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded-full"
      title="Active Claude Account"
    >
      {accountName}
    </span>
  );
}
