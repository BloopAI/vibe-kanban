import { type BaseCodingAgent } from 'shared/types';
import { Agents } from 'shared/agent-constants';
import { useTheme, getResolvedTheme } from '@/shared/hooks/useTheme';
import { toPrettyCase } from '@/shared/lib/string';
import { cn } from '@/shared/lib/utils';
import { useInstalledAcpServers } from '@/shared/hooks/useAcpServers';

type AgentIconProps = {
  agent: BaseCodingAgent | null | undefined;
  iconUrl?: string;
  className?: string;
};

export function getAgentName(
  agent: BaseCodingAgent | null | undefined
): string {
  if (!agent) return 'Agent';
  switch (agent) {
    case Agents.CLAUDE_CODE:
      return 'Claude Code';
    case Agents.AMP:
      return 'AMP';
    case Agents.GEMINI:
      return 'Gemini';
    case Agents.CODEX:
      return 'Codex';
    case Agents.OPENCODE:
      return 'OpenCode';
    case Agents.CURSOR:
      return 'Cursor';
    case Agents.QWEN_CODE:
      return 'Qwen Code';
    case Agents.GITHUB_COPILOT_CLI:
      return 'GitHub Copilot';
    case Agents.FACTORY_DROID:
      return 'Factory Droid';
    default:
      // SCREAMING_SNAKE_CASE → "Pretty Case"
      return toPrettyCase(agent);
  }
}

export function AgentIcon({
  agent,
  iconUrl,
  className = 'h-4 w-4',
}: AgentIconProps) {
  const { theme } = useTheme();
  const resolvedTheme = getResolvedTheme(theme);
  const isDark = resolvedTheme === 'dark';
  const suffix = isDark ? '-dark' : '-light';

  const { data: installedServers } = useInstalledAcpServers();
  const resolvedIconUrl =
    iconUrl ??
    installedServers?.find((s) => s.name === agent)?.icon ??
    undefined;

  if (!agent) {
    return null;
  }

  const agentName = getAgentName(agent);
  let iconPath = '';

  switch (agent) {
    case Agents.CLAUDE_CODE:
      iconPath = `/agents/claude${suffix}.svg`;
      break;
    case Agents.AMP:
      iconPath = `/agents/amp${suffix}.svg`;
      break;
    case Agents.GEMINI:
      iconPath = `/agents/gemini${suffix}.svg`;
      break;
    case Agents.CODEX:
      iconPath = `/agents/codex${suffix}.svg`;
      break;
    case Agents.OPENCODE:
      iconPath = `/agents/opencode${suffix}.svg`;
      break;
    case Agents.CURSOR:
      iconPath = `/agents/cursor${suffix}.svg`;
      break;
    case Agents.QWEN_CODE:
      iconPath = `/agents/qwen${suffix}.svg`;
      break;
    case Agents.GITHUB_COPILOT_CLI:
      iconPath = `/agents/copilot${suffix}.svg`;
      break;
    case Agents.FACTORY_DROID:
      iconPath = `/agents/droid${suffix}.svg`;
      break;
    default:
      if (resolvedIconUrl) {
        return (
          <img
            src={resolvedIconUrl}
            alt={agentName}
            className={cn(className, 'brightness-0', isDark && 'invert')}
          />
        );
      }
      iconPath = `/agents/acp${suffix}.svg`;
      break;
  }

  return <img src={iconPath} alt={agentName} className={className} />;
}
