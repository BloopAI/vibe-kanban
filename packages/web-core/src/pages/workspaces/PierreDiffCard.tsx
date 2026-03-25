import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDownIcon, CopyIcon, EyeIcon } from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';
import { useTheme } from '@/shared/hooks/useTheme';
import { getActualTheme } from '@/shared/lib/theme';
import { isRealMobileDevice } from '@/shared/hooks/useIsMobile';
import { getFileIcon } from '@/shared/lib/fileTypeIcon';
import { useOpenInEditor } from '@/shared/hooks/useOpenInEditor';
import { OpenInIdeButton } from '@/shared/components/OpenInIdeButton';
import { CopyButton } from '@/shared/components/CopyButton';
import { writeClipboardViaBridge } from '@/shared/lib/clipboard';
import { Tooltip } from '@vibe/ui/components/Tooltip';
import { DisplayTruncatedPath } from '@/shared/lib/TruncatePath';
import { DiffCardExpandedBody } from './DiffCardExpandedBody';
import { MarkdownPreview } from '@/shared/components/MarkdownPreview';
import type { Diff } from 'shared/types';

interface PierreDiffCardProps {
  diff: Diff;
  expanded: boolean;
  onToggle: () => void;
  onExpandedBodyReadyChange?: (ready: boolean) => void;
  workspaceId: string;
  className: string;
}

const CHANGE_LABELS: Record<string, string> = {
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
  copied: 'Copied',
  permissionChange: 'Perm',
};

const IS_MOBILE = isRealMobileDevice();

function PierreDiffCardInner({
  diff,
  expanded,
  onToggle,
  onExpandedBodyReadyChange,
  workspaceId,
  className = '',
}: PierreDiffCardProps) {
  const { t } = useTranslation('tasks');
  const { theme } = useTheme();
  const actualTheme = getActualTheme(theme);

  const filePath = diff.newPath || diff.oldPath || 'unknown';
  const oldPath = diff.oldPath;
  const changeKind = diff.change;
  const additions = diff.additions ?? 0;
  const deletions = diff.deletions ?? 0;
  const hasStats = additions > 0 || deletions > 0;
  const changeLabel = changeKind ? (CHANGE_LABELS[changeKind] ?? null) : null;

  const isMarkdownFile = useMemo(() => {
    if (diff.contentOmitted) return false;
    return filePath.endsWith('.md') || filePath.endsWith('.mdx');
  }, [filePath, diff.contentOmitted]);
  const [viewMode, setViewMode] = useState<'diff' | 'preview'>('diff');
  const markdownContent = useMemo(() => {
    if (!isMarkdownFile) return '';
    if (diff.change === 'deleted') return diff.oldContent ?? '';
    return diff.newContent ?? '';
  }, [isMarkdownFile, diff]);

  const FileIcon = getFileIcon(filePath, actualTheme);
  const openInEditor = useOpenInEditor(workspaceId);
  const handleOpenInIde = useCallback(() => {
    openInEditor({ filePath });
  }, [openInEditor, filePath]);
  const handleCopyFilePath = useCallback(() => {
    void writeClipboardViaBridge(filePath);
  }, [filePath]);

  const handleToggle = useCallback(() => {
    onToggle();
  }, [onToggle]);

  return (
    <div className={cn('pb-base rounded-sm', className)}>
      <div
        className={cn(
          'group/card w-full flex items-center bg-primary px-base gap-base sticky top-0 z-10 border-b border-transparent',
          'cursor-pointer min-h-10',
          expanded && 'rounded-t-sm'
        )}
        onClick={handleToggle}
      >
        <span className="relative shrink-0">
          <FileIcon className="size-icon-base" />
        </span>
        {changeLabel && (
          <span
            className={cn(
              'text-sm shrink-0 bg-primary rounded-sm px-half',
              changeKind === 'deleted' && 'text-error border border-error/20',
              changeKind === 'added' && 'text-success border border-success/20'
            )}
          >
            {changeLabel}
          </span>
        )}
        <div className="flex items-center gap-half flex-1 min-w-0">
          <div
            className={cn(
              'text-sm min-w-0 flex-1',
              changeKind === 'deleted' && 'text-error line-through'
            )}
          >
            <DisplayTruncatedPath path={filePath} />
          </div>
          <span onClick={(e) => e.stopPropagation()} className="shrink-0">
            <CopyButton
              onCopy={handleCopyFilePath}
              disabled={false}
              iconSize="size-icon-xs"
              icon={CopyIcon}
            />
          </span>
        </div>
        {(changeKind === 'renamed' || changeKind === 'copied') && oldPath && (
          <span className="text-low text-sm shrink-0">
            ← {oldPath.split('/').pop()}
          </span>
        )}
        {hasStats && (
          <span className="text-sm shrink-0">
            {additions > 0 && (
              <span className="text-success">+{additions}</span>
            )}
            {additions > 0 && deletions > 0 && ' '}
            {deletions > 0 && <span className="text-error">-{deletions}</span>}
          </span>
        )}
        <div className="flex items-center gap-half shrink-0">
          {isMarkdownFile && (
            <span onClick={(e) => e.stopPropagation()}>
              <Tooltip
                content={
                  viewMode === 'diff'
                    ? t('diff.markdownPreview.showPreview')
                    : t('diff.markdownPreview.showDiff')
                }
                side="top"
              >
                <button
                  className={cn(
                    'flex items-center justify-center transition-colors',
                    'text-low hover:text-normal',
                    viewMode === 'preview' &&
                      'text-brand hover:text-brand-hover'
                  )}
                  aria-label={
                    viewMode === 'diff'
                      ? t('diff.markdownPreview.showPreview')
                      : t('diff.markdownPreview.showDiff')
                  }
                  onClick={() =>
                    setViewMode((v) => (v === 'diff' ? 'preview' : 'diff'))
                  }
                >
                  <EyeIcon
                    className="size-icon-xs"
                    weight={viewMode === 'preview' ? 'fill' : 'regular'}
                  />
                </button>
              </Tooltip>
            </span>
          )}
          {!IS_MOBILE && (
            <span onClick={(e) => e.stopPropagation()}>
              <OpenInIdeButton
                onClick={handleOpenInIde}
                className="size-icon-xs p-0"
              />
            </span>
          )}
          <CaretDownIcon
            className={cn(
              'size-icon-xs text-low transition-transform',
              !expanded && '-rotate-90'
            )}
          />
        </div>
      </div>

      {expanded &&
        (viewMode === 'preview' && isMarkdownFile ? (
          <div className="bg-primary rounded-b-sm overflow-hidden">
            <div className="p-base overflow-auto max-h-[80vh]">
              <MarkdownPreview content={markdownContent} theme={actualTheme} />
            </div>
          </div>
        ) : (
          <DiffCardExpandedBody
            diff={diff}
            filePath={filePath}
            additions={additions}
            deletions={deletions}
            onReadyChange={onExpandedBodyReadyChange}
          />
        ))}
    </div>
  );
}

export const PierreDiffCard = React.memo(PierreDiffCardInner);
