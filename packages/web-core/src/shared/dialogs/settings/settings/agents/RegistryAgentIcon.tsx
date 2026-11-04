import { useState } from 'react';
import type { AcpRegistryAgent } from 'shared/types';
import { cn } from '@/shared/lib/utils';

/**
 * Registry icon, or the agent's first letter if it has none or fails to load.
 * `className` sets the box size; registry glyphs fill their viewBox, so they're
 * inset by 3/16 per side to match the built-in 16px icons (10px glyph inside).
 */
export function RegistryAgentIcon({
  agent,
  className,
}: {
  agent: Pick<AcpRegistryAgent, 'name' | 'icon'>;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={cn(
        'shrink-0 flex items-center justify-center font-medium text-low leading-none',
        className
      )}
    >
      {agent.icon && !failed ? (
        // Registry icons are monochrome, so invert them for dark mode
        <img
          src={agent.icon}
          alt={agent.name}
          className="size-[62.5%] dark:invert"
          onError={() => setFailed(true)}
        />
      ) : (
        agent.name.charAt(0).toUpperCase()
      )}
    </span>
  );
}
