import { useMemo } from 'react';
import { CaretDownIcon, ArrowSquareUpRightIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getFileIcon } from '@/utils/fileTypeIcon';
import { useTheme } from '@/components/ThemeProvider';
import { getActualTheme } from '@/utils/theme';
import { ToolStatus, ActionType } from 'shared/types';
import { parseDiffStats } from '@/utils/diffStatsParser';
import { inIframe, openFileInVSCode } from '@/vscode/bridge';
import { ToolStatusDot } from './ToolStatusDot';
import {
  DiffViewBody,
  useDiffData,
  type DiffInput,
} from './PierreConversationDiff';

type FileEditAction = Extract<ActionType, { action: 'file_edit' }>;
type FileChange = FileEditAction['changes'][number];

export interface AggregatedDiffEntry {
  /** The file change data */
  change: FileChange;
  /** Tool status for this change */
  status: ToolStatus | null;
  /** Unique key for expansion state */
  expansionKey: string;
}

interface ChatAggregatedDiffEntriesProps {
  /** The file path being edited */
  filePath: string;
  /** The individual diff entries for this file */
  entries: AggregatedDiffEntry[];
  /** Whether the accordion is expanded */
  expanded: boolean;
  /** Currently hovered state */
  isHovered: boolean;
  /** Callback when toggling expansion */
  onToggle: () => void;
  /** Callback when hover state changes */
  onHoverChange: (hovered: boolean) => void;
  /** Callback to open file in changes panel */
  onOpenInChanges: (() => void) | null;
  className?: string;
}

/**
 * Renders a single diff entry within the aggregated view (always expanded)
 */
function DiffEntry({
  filePath,
  change,
  status,
}: {
  filePath: string;
  change: FileChange;
  status: ToolStatus | null;
}) {
  const { theme } = useTheme();
  const actualTheme = getActualTheme(theme);

  // Calculate diff stats
  const { additions, deletions } = useMemo(() => {
    if (change.action === 'edit' && change.unified_diff) {
      return parseDiffStats(change.unified_diff);
    }
    return { additions: undefined, deletions: undefined };
  }, [change]);

  // For write actions, count as all additions
  const writeAdditions =
    change.action === 'write' ? change.content.split('\n').length : undefined;

  // Build diff content for rendering
  const diffContent: DiffInput | undefined = useMemo(() => {
    if (change.action === 'edit' && change.unified_diff) {
      return {
        type: 'unified',
        path: filePath,
        unifiedDiff: change.unified_diff,
        hasLineNumbers: change.has_line_numbers ?? true,
      };
    }
    if (change.action === 'write' && change.content) {
      return {
        type: 'content',
        oldContent: '',
        newContent: change.content,
        newPath: filePath,
      };
    }
    return undefined;
  }, [change, filePath]);

  const diffData = useDiffData(
    diffContent ?? { type: 'unified', path: filePath, unifiedDiff: '' }
  );
  const hasDiffContent = diffContent && diffData.isValid;

  const hasStats =
    (additions !== undefined && additions > 0) ||
    (deletions !== undefined && deletions > 0) ||
    (writeAdditions !== undefined && writeAdditions > 0);

  // Get a label for the change action
  const actionLabel = useMemo(() => {
    switch (change.action) {
      case 'edit':
        return 'Edit';
      case 'write':
        return 'Write';
      case 'delete':
        return 'Delete';
      case 'rename':
        return `Rename → ${change.new_path}`;
      default:
        return 'Change';
    }
  }, [change]);

  return (
    <div className="border-t border-muted/50 first:border-t-0">
      {/* Header showing action type and stats */}
      <div className="flex items-center p-base bg-muted/10">
        <div className="flex-1 flex items-center gap-base min-w-0">
          <span className="relative shrink-0">
            {status && <ToolStatusDot status={status} className="size-2" />}
          </span>
          <span className="text-sm text-low">{actionLabel}</span>
          {hasStats && (
            <span className="text-sm shrink-0">
              {(additions ?? writeAdditions) !== undefined &&
                (additions ?? writeAdditions)! > 0 && (
                  <span className="text-success">
                    +{additions ?? writeAdditions}
                  </span>
                )}
              {(additions ?? writeAdditions) !== undefined &&
                deletions !== undefined &&
                deletions > 0 &&
                ' '}
              {deletions !== undefined && deletions > 0 && (
                <span className="text-error">-{deletions}</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Diff body - always shown */}
      {hasDiffContent && (
        <DiffViewBody
          fileDiffMetadata={diffData.fileDiffMetadata}
          unifiedDiff={diffData.unifiedDiff}
          isValid={diffData.isValid}
          hideLineNumbers={diffData.hideLineNumbers}
          theme={actualTheme}
        />
      )}
    </div>
  );
}

export function ChatAggregatedDiffEntries({
  filePath,
  entries,
  expanded,
  isHovered,
  onToggle,
  onHoverChange,
  onOpenInChanges,
  className,
}: ChatAggregatedDiffEntriesProps) {
  const { t } = useTranslation('tasks');
  const { theme } = useTheme();
  const actualTheme = getActualTheme(theme);
  const FileIcon = getFileIcon(filePath, actualTheme);
  const isVSCode = inIframe();

  const handleClick = () => {
    if (isVSCode) {
      openFileInVSCode(filePath, { openAsDiff: false });
    } else {
      onToggle();
    }
  };

  // Calculate total additions/deletions across all changes
  const totalStats = useMemo(() => {
    let additions = 0;
    let deletions = 0;

    for (const entry of entries) {
      const { change } = entry;
      if (change.action === 'edit' && change.unified_diff) {
        const stats = parseDiffStats(change.unified_diff);
        additions += stats.additions ?? 0;
        deletions += stats.deletions ?? 0;
      } else if (change.action === 'write' && change.content) {
        additions += change.content.split('\n').length;
      }
    }

    return { additions, deletions };
  }, [entries]);

  // Get the worst status among all entries
  const aggregateStatus = useMemo(() => {
    return entries.reduce<ToolStatus | null>((worst, entry) => {
      if (!entry.status) return worst;
      if (!worst) return entry.status;

      const statusPriority: Record<string, number> = {
        failed: 6,
        denied: 5,
        timed_out: 4,
        pending_approval: 3,
        created: 2,
        success: 1,
      };

      const worstPriority = statusPriority[worst.status] || 0;
      const currentPriority = statusPriority[entry.status.status] || 0;

      return currentPriority > worstPriority ? entry.status : worst;
    }, null);
  }, [entries]);

  const isDenied = aggregateStatus?.status === 'denied';
  const hasStats = totalStats.additions > 0 || totalStats.deletions > 0;

  return (
    <div
      className={cn(
        'rounded-sm border overflow-hidden',
        isDenied && 'border-error bg-error/10',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center p-base w-full',
          isDenied ? 'bg-error/20' : 'bg-panel',
          'cursor-pointer'
        )}
        onClick={handleClick}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        role="button"
        aria-expanded={expanded}
      >
        <div className="flex-1 flex items-center gap-base min-w-0">
          <span className="relative shrink-0">
            {!isVSCode && isHovered ? (
              <CaretDownIcon
                className={cn(
                  'size-icon-base transition-transform duration-150',
                  !expanded && '-rotate-90'
                )}
              />
            ) : (
              <FileIcon className="size-icon-base" />
            )}
            {aggregateStatus && (
              <ToolStatusDot
                status={aggregateStatus}
                className="absolute -bottom-0.5 -right-0.5"
              />
            )}
          </span>
          <span className="text-sm text-normal truncate">{filePath}</span>
          <span className="text-xs text-low shrink-0">
            · {entries.length} {entries.length === 1 ? 'edit' : 'edits'}
          </span>
          {!isVSCode && onOpenInChanges && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenInChanges();
              }}
              className="shrink-0 p-0.5 rounded hover:bg-muted text-low hover:text-normal transition-colors"
              title={t('conversation.viewInChangesPanel')}
            >
              <ArrowSquareUpRightIcon className="size-icon-xs" />
            </button>
          )}
          {hasStats && (
            <span className="text-sm shrink-0">
              {totalStats.additions > 0 && (
                <span className="text-success">+{totalStats.additions}</span>
              )}
              {totalStats.additions > 0 && totalStats.deletions > 0 && ' '}
              {totalStats.deletions > 0 && (
                <span className="text-error">-{totalStats.deletions}</span>
              )}
            </span>
          )}
        </div>
        {!isVSCode && (
          <CaretDownIcon
            className={cn(
              'size-icon-xs shrink-0 text-low transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        )}
      </div>

      {/* Expanded content - list of individual diffs (hidden in VS Code mode) */}
      {!isVSCode && expanded && (
        <div className="border-t">
          {entries.map((entry) => (
            <DiffEntry
              key={entry.expansionKey}
              filePath={filePath}
              change={entry.change}
              status={entry.status}
            />
          ))}
        </div>
      )}
    </div>
  );
}
