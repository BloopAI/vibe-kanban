import { useQuery } from '@tanstack/react-query';

export const discordOnlineCountKeys = {
  all: ['discord-online-count'] as const,
};

const DISCORD_GUILD_ID = '1423630976524877857';

async function fetchDiscordOnlineCount(): Promise<number | null> {
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/widget.json`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      console.warn(`Discord API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (typeof data?.presence_count === 'number') {
      return data.presence_count;
    }

    return null;
  } catch (error) {
    console.warn('Failed to fetch Discord online count:', error);
    return null;
  }
}

export function useDiscordOnlineCount() {
  return useQuery({
    queryKey: discordOnlineCountKeys.all,
    queryFn: fetchDiscordOnlineCount,
    refetchInterval: 10 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnMount: false,
    placeholderData: (previousData) => previousData,
  });
}
