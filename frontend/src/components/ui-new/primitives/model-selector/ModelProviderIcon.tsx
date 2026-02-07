import {
  CircleDashedIcon,
  HardDriveIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useTheme, getResolvedTheme } from '@/components/ThemeProvider';

const sizeClasses = {
  sm: 'size-icon-sm',
  base: 'size-icon-base',
  lg: 'size-icon-lg',
} as const;

export function ModelProviderIcon({
  providerId,
  size = 'base',
}: {
  providerId: string;
  size?: keyof typeof sizeClasses;
}) {
  const { theme } = useTheme();
  const resolvedTheme = getResolvedTheme(theme);
  const suffix = resolvedTheme === 'dark' ? '-dark' : '-light';
  const id = providerId.toLowerCase();
  const className = cn(sizeClasses[size], 'flex-shrink-0');

  if (id === '__default__') {
    return <CircleDashedIcon className={className} />;
  }

  if (id.includes('anthropic') || id.includes('claude')) {
    return (
      <img
        src={`/agents/claude${suffix}.svg`}
        alt="Anthropic"
        className={className}
      />
    );
  }

  if (id.includes('openai') || id.includes('gpt')) {
    return (
      <img
        src={`/agents/codex${suffix}.svg`}
        alt="OpenAI"
        className={className}
      />
    );
  }

  if (id.includes('google') || id.includes('gemini')) {
    return (
      <span
        className={cn(
          'flex items-center justify-center font-extrabold text-[0.95em] leading-none',
          sizeClasses[size]
        )}
      >
        G
      </span>
    );
  }

  if (
    id.includes('local') ||
    id.includes('ollama') ||
    id.includes('llama') ||
    id.includes('server')
  ) {
    return <HardDriveIcon className={className} />;
  }

  return <SparkleIcon className={className} />;
}
