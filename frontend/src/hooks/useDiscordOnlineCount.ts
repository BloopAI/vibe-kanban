import { useQuery } from '@tanstack/react-query';

const DISCORD_GUILD_ID = '1423630976524877857';

async function fetchDiscordOnlineCount(): Promise<number | null> {
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`,
      { cache: 'no-store' }
    );

    // Handle rate limiting - don't retry, just return null
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      console.warn(
        `Discord API rate limited. Retry after ${retryAfter} seconds.`
      );
      return null;
    }

    // If widget is disabled or other error, return null
    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (typeof data?.presence_count === 'number') {
      return data.presence_count;
    }

    return null;
  } catch (error) {
    // Network error or other exception - return null gracefully
    console.warn('Failed to fetch Discord online count:', error);
    return null;
  }
}

export function useDiscordOnlineCount() {
  return useQuery({
    queryKey: ['discord-online-count'],
    queryFn: fetchDiscordOnlineCount,
    // Refetch every 10 minutes (600,000ms) to avoid rate limiting
    refetchInterval: 10 * 60 * 1000,
    // Consider data fresh for 10 minutes
    staleTime: 10 * 60 * 1000,
    // Don't retry on failure - we'll just show no count
    retry: false,
    // Don't refetch on mount if data is still fresh
    refetchOnMount: false,
    // Keep previous data while fetching new data
    placeholderData: (previousData) => previousData,
  });
}
