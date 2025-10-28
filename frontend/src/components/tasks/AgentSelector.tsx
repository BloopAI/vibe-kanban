import React from 'react';
import { Bot, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ExecutorProfileId, BaseCodingAgent } from 'shared/types';

interface AgentSelectorProps {
  profiles: Record<string, Record<string, unknown>> | null;
  selectedExecutorProfile: ExecutorProfileId | null;
  onChange: (profile: ExecutorProfileId) => void;
  disabled?: boolean;
  className?: string;
}

export const AgentSelector = React.memo<AgentSelectorProps>(
  ({
    profiles,
    selectedExecutorProfile,
    onChange,
    disabled,
    className = '',
  }) => {
    if (!profiles) return null;

    const agents = React.useMemo(
      () => Object.keys(profiles).sort() as BaseCodingAgent[],
      [profiles]
    );

    const selectedAgent = selectedExecutorProfile?.executor;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`w-full justify-between text-xs ${className}`}
            disabled={disabled}
            aria-label="Select agent"
          >
            <div className="flex items-center gap-1.5 w-full">
              <Bot className="h-3 w-3" />
              <span className="truncate">{selectedAgent || 'Agent'}</span>
            </div>
            <ArrowDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          {agents.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground text-center">
              No agents available
            </div>
          ) : (
            agents.map((agent) => (
              <DropdownMenuItem
                key={agent}
                onClick={() => {
                  onChange({
                    executor: agent,
                    variant: null,
                  });
                }}
                className={selectedAgent === agent ? 'bg-accent' : ''}
              >
                {agent}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

AgentSelector.displayName = 'AgentSelector';
