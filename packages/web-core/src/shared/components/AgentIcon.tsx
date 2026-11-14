import { BaseCodingAgent } from 'shared/types';
import { getResolvedTheme, useTheme } from '@/shared/hooks/useTheme';

type AgentIconProps = {
  agent: BaseCodingAgent | null | undefined;
  className?: string;
};

export function getAgentName(
  agent: BaseCodingAgent | null | undefined
): string {
  if (!agent) return 'Agent';
  switch (agent) {
    case 'CLAUDE_CODE':
      return 'Claude Code';
    case 'AMP':
      return 'AMP';
    case 'GEMINI':
      return 'Gemini';
    case 'CODEX':
      return 'Codex';
    case 'OPENCODE':
      return 'OpenCode';
    case 'CURSOR_AGENT':
      return 'Cursor';
    case 'QWEN_CODE':
      return 'Qwen';
    case 'COPILOT':
      return 'Copilot';
    case 'DROID':
      return 'Droid';
    default:
      return agent;
  }
}

export function AgentIcon({ agent, className = 'h-4 w-4' }: AgentIconProps) {
  const { theme } = useTheme();
  const resolvedTheme = getResolvedTheme(theme);
  const isDark = resolvedTheme === 'dark';
  const suffix = isDark ? '-dark' : '-light';

  if (!agent) {
    return null;
  }

  const agentName = getAgentName(agent);
  let iconPath = '';

  switch (agent) {
    case 'CLAUDE_CODE':
      iconPath = `/agents/claude${suffix}.svg`;
      break;
    case 'AMP':
      iconPath = `/agents/amp${suffix}.svg`;
      break;
    case 'GEMINI':
      iconPath = `/agents/gemini${suffix}.svg`;
      break;
    case 'CODEX':
      iconPath = `/agents/codex${suffix}.svg`;
      break;
    case 'OPENCODE':
      iconPath = `/agents/opencode${suffix}.svg`;
      break;
    case 'CURSOR_AGENT':
      iconPath = `/agents/cursor${suffix}.svg`;
      break;
    case 'QWEN_CODE':
      iconPath = `/agents/qwen${suffix}.svg`;
      break;
    case 'COPILOT':
      iconPath = `/agents/copilot${suffix}.svg`;
      break;
    case 'DROID':
      iconPath = `/agents/droid${suffix}.svg`;
      break;
    default:
      return null;
  }

  return <img src={iconPath} alt={agentName} className={className} />;
}
