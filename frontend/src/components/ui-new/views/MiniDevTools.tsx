import { useState } from 'react';
import {
  CaretUpIcon,
  CaretDownIcon,
  TrashIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type {
  ConsoleEntry,
  NetworkEntry,
  ErrorEntry,
} from '@/types/previewDevTools';

interface MiniDevToolsProps {
  consoleLogs: ConsoleEntry[];
  networkRequests: NetworkEntry[];
  errors: ErrorEntry[];
  onClearConsole: () => void;
  onClearNetwork: () => void;
  onClearErrors: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

type TabType = 'console' | 'network' | 'errors';

const getLevelColor = (level: string): string => {
  switch (level) {
    case 'error':
      return 'text-red-500';
    case 'warn':
      return 'text-yellow-500';
    case 'info':
      return 'text-blue-500';
    case 'debug':
      return 'text-gray-400';
    case 'log':
    default:
      return 'text-gray-400';
  }
};

const getLevelBadgeColor = (level: string): string => {
  switch (level) {
    case 'error':
      return 'bg-red-500/20 text-red-500';
    case 'warn':
      return 'bg-yellow-500/20 text-yellow-500';
    case 'info':
      return 'bg-blue-500/20 text-blue-500';
    case 'debug':
      return 'bg-gray-500/20 text-gray-400';
    case 'log':
    default:
      return 'bg-gray-500/20 text-gray-400';
  }
};

const getStatusColor = (status?: number): string => {
  if (!status) return 'bg-gray-500/20 text-gray-400';
  if (status >= 200 && status < 300) return 'bg-green-500/20 text-green-500';
  if (status >= 300 && status < 400) return 'bg-yellow-500/20 text-yellow-500';
  return 'bg-red-500/20 text-red-500';
};

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatUrl = (url: string, maxLength: number = 50): string => {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + '...';
};

const formatDuration = (duration?: number): string => {
  if (!duration) return '-';
  return `${Math.round(duration)}ms`;
};

const formatArgs = (args: unknown[]): string => {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');
};

export function MiniDevTools({
  consoleLogs,
  networkRequests,
  errors,
  onClearConsole,
  onClearNetwork,
  onClearErrors,
  isCollapsed,
  onToggleCollapse,
  className,
}: MiniDevToolsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('console');
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);

  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab);
    if (isCollapsed) {
      onToggleCollapse();
    }
  };

  const handleClearClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeTab === 'console') onClearConsole();
    else if (activeTab === 'network') onClearNetwork();
    else if (activeTab === 'errors') onClearErrors();
  };

  return (
    <div
      className={cn(
        'backdrop-blur-sm bg-primary/80 border border-brand/20 rounded-md shadow-md flex flex-col',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-base gap-base shrink-0">
        <div className="flex items-center gap-base flex-1 min-w-0">
          <button
            onClick={onToggleCollapse}
            className="flex items-center justify-center text-low hover:text-normal transition-colors"
            aria-label={isCollapsed ? 'Expand DevTools' : 'Collapse DevTools'}
          >
            {isCollapsed ? (
              <CaretDownIcon size={16} weight="fill" />
            ) : (
              <CaretUpIcon size={16} weight="fill" />
            )}
          </button>

          {isCollapsed ? (
            <div className="flex items-center gap-base min-w-0">
              <span className="text-sm text-high font-medium whitespace-nowrap">
                DevTools
              </span>
              <div className="flex items-center gap-half min-w-0">
                <button
                  onClick={() => handleTabClick('console')}
                  className="text-xs text-low hover:text-normal transition-colors whitespace-nowrap"
                >
                  Console ({consoleLogs.length})
                </button>
                <button
                  onClick={() => handleTabClick('network')}
                  className="text-xs text-low hover:text-normal transition-colors whitespace-nowrap"
                >
                  Network ({networkRequests.length})
                </button>
                <button
                  onClick={() => handleTabClick('errors')}
                  className="text-xs text-low hover:text-normal transition-colors whitespace-nowrap"
                >
                  Errors ({errors.length})
                </button>
              </div>
            </div>
          ) : (
            <>
              <span className="text-sm text-high font-medium">DevTools</span>
              <div className="flex items-center gap-base">
                <button
                  onClick={() => setActiveTab('console')}
                  className={cn(
                    'text-xs px-base py-half rounded border transition-colors',
                    activeTab === 'console'
                      ? 'bg-secondary border-brand/40 text-high'
                      : 'border-transparent text-low hover:text-normal'
                  )}
                >
                  Console ({consoleLogs.length})
                </button>
                <button
                  onClick={() => setActiveTab('network')}
                  className={cn(
                    'text-xs px-base py-half rounded border transition-colors',
                    activeTab === 'network'
                      ? 'bg-secondary border-brand/40 text-high'
                      : 'border-transparent text-low hover:text-normal'
                  )}
                >
                  Network ({networkRequests.length})
                </button>
                <button
                  onClick={() => setActiveTab('errors')}
                  className={cn(
                    'text-xs px-base py-half rounded border transition-colors',
                    activeTab === 'errors'
                      ? 'bg-secondary border-brand/40 text-high'
                      : 'border-transparent text-low hover:text-normal'
                  )}
                >
                  Errors ({errors.length})
                </button>
              </div>
            </>
          )}
        </div>

        {!isCollapsed && (
          <button
            onClick={handleClearClick}
            className="flex items-center justify-center gap-half px-base py-half rounded border border-transparent text-low hover:text-normal transition-colors text-xs whitespace-nowrap"
            aria-label="Clear current tab"
          >
            <TrashIcon size={14} />
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      {!isCollapsed && (
        <>
          <div className="border-t border-brand/20" />
          <div className="flex-1 min-h-0 overflow-auto max-h-64 font-mono text-xs">
            {activeTab === 'console' && (
              <div className="divide-y divide-brand/10">
                {consoleLogs.length === 0 ? (
                  <div className="p-base text-low">No console logs</div>
                ) : (
                  consoleLogs.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-base hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-start gap-base">
                        <span className="text-low whitespace-nowrap flex-shrink-0">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                        <span
                          className={cn(
                            'px-half py-0.5 rounded text-xs font-medium whitespace-nowrap flex-shrink-0',
                            getLevelBadgeColor(entry.level)
                          )}
                        >
                          {entry.level.toUpperCase()}
                        </span>
                        <span className={cn('text-normal break-words', getLevelColor(entry.level))}>
                          {formatArgs(entry.args)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'network' && (
              <div className="divide-y divide-brand/10">
                {networkRequests.length === 0 ? (
                  <div className="p-base text-low">No network requests</div>
                ) : (
                  networkRequests.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-base hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-start gap-base">
                        <span className="text-low whitespace-nowrap flex-shrink-0">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                        <span
                          className={cn(
                            'px-half py-0.5 rounded text-xs font-medium whitespace-nowrap flex-shrink-0',
                            getStatusColor(entry.status)
                          )}
                        >
                          {entry.status || 'PENDING'}
                        </span>
                        <span className="text-normal whitespace-nowrap flex-shrink-0">
                          {entry.method}
                        </span>
                        <span className="text-low break-all flex-1">
                          {formatUrl(entry.url)}
                        </span>
                        <span className="text-low whitespace-nowrap flex-shrink-0">
                          {formatDuration(entry.duration)}
                        </span>
                      </div>
                      {entry.error && (
                        <div className="mt-half text-red-500 text-xs">
                          Error: {entry.error}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'errors' && (
              <div className="divide-y divide-brand/10">
                {errors.length === 0 ? (
                  <div className="p-base text-low">No errors</div>
                ) : (
                  errors.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-base hover:bg-secondary/50 transition-colors"
                    >
                      <button
                        onClick={() =>
                          setExpandedErrorId(
                            expandedErrorId === entry.id ? null : entry.id
                          )
                        }
                        className="w-full text-left flex items-start gap-base"
                      >
                        <span className="text-red-500 flex-shrink-0 mt-0.5">
                          <WarningCircleIcon size={14} weight="fill" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-normal text-red-500 break-words">
                            {entry.message}
                          </div>
                          {(entry.filename || entry.lineno) && (
                            <div className="text-low text-xs mt-half">
                              {entry.filename}
                              {entry.lineno && `:${entry.lineno}`}
                              {entry.colno && `:${entry.colno}`}
                            </div>
                          )}
                        </div>
                      </button>
                      {expandedErrorId === entry.id && entry.stack && (
                        <div className="mt-base p-half bg-secondary/50 rounded border border-brand/10 text-low text-xs whitespace-pre-wrap break-words">
                          {entry.stack}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
