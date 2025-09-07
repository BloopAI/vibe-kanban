import { Diff } from 'shared/types';
import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import { generateDiffFile } from '@git-diff-view/file';
import { useMemo } from 'react';
import { useUserSystem } from '@/components/config-provider';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import { getActualTheme } from '@/utils/theme';
import { Button } from '@/components/ui/button';
import {
  ChevronRight,
  ChevronUp,
  Trash2,
  ArrowLeftRight,
  FilePlus2,
  PencilLine,
  Copy,
  Key,
  ExternalLink,
} from 'lucide-react';
import '@/styles/diff-style-overrides.css';
import { attemptsApi } from '@/lib/api';
import type { TaskAttempt } from 'shared/types';

type Props = {
  diff: Diff;
  expanded: boolean;
  onToggle: () => void;
  selectedAttempt: TaskAttempt | null;
};

function labelAndIcon(diff: Diff) {
  const c = diff.change;
  if (c === 'deleted') return { label: 'Deleted', Icon: Trash2 };
  if (c === 'renamed') return { label: 'Renamed', Icon: ArrowLeftRight };
  if (c === 'added')
    return { label: undefined as string | undefined, Icon: FilePlus2 };
  if (c === 'copied') return { label: 'Copied', Icon: Copy };
  if (c === 'permissionChange')
    return { label: 'Permission Changed', Icon: Key };
  return { label: undefined as string | undefined, Icon: PencilLine };
}

export default function DiffCard({
  diff,
  expanded,
  onToggle,
  selectedAttempt,
}: Props) {
  const { config } = useUserSystem();
  const theme = getActualTheme(config?.theme);

  const oldName = diff.oldPath || undefined;
  const newName = diff.newPath || oldName || 'unknown';
  const oldLang =
    getHighLightLanguageFromPath(oldName || newName || '') || 'plaintext';
  const newLang =
    getHighLightLanguageFromPath(newName || oldName || '') || 'plaintext';
  const { label, Icon } = labelAndIcon(diff);

  // Build a diff from raw contents so the viewer can expand beyond hunks
  const oldContentSafe = diff.oldContent || '';
  const newContentSafe = diff.newContent || '';
  const isContentEqual = oldContentSafe === newContentSafe;

  const diffFile = useMemo(() => {
    if (isContentEqual) return null;
    try {
      const oldFileName = oldName || newName || 'unknown';
      const newFileName = newName || oldName || 'unknown';
      const file = generateDiffFile(
        oldFileName,
        oldContentSafe,
        newFileName,
        newContentSafe,
        oldLang,
        newLang
      );
      file.initRaw();
      return file;
    } catch (e) {
      console.error('Failed to build diff for view', e);
      return null;
    }
  }, [
    isContentEqual,
    oldName,
    newName,
    oldLang,
    newLang,
    oldContentSafe,
    newContentSafe,
  ]);

  const add = diffFile?.additionLength ?? 0;
  const del = diffFile?.deletionLength ?? 0;

  // Title row
  const title = (
    <p
      className="text-xs font-mono overflow-x-auto flex-1"
      style={{ color: 'hsl(var(--muted-foreground) / 0.7)' }}
    >
      <Icon className="h-3 w-3 inline mr-2" aria-hidden />
      {label && <span className="mr-2">{label}</span>}
      {diff.change === 'renamed' && oldName ? (
        <span className="inline-flex items-center gap-2">
          <span>{oldName}</span>
          <span aria-hidden>→</span>
          <span>{newName}</span>
        </span>
      ) : (
        <span>{newName}</span>
      )}
      <span className="ml-3" style={{ color: 'hsl(var(--console-success))' }}>
        +{add}
      </span>
      <span className="ml-2" style={{ color: 'hsl(var(--console-error))' }}>
        -{del}
      </span>
    </p>
  );

  const handleOpenInIDE = async () => {
    if (!selectedAttempt?.id) return;
    try {
      const openPath = newName || oldName;
      await attemptsApi.openEditor(
        selectedAttempt.id,
        undefined,
        openPath || undefined
      );
    } catch (err) {
      console.error('Failed to open file in IDE:', err);
    }
  };

  const expandable = true;

  return (
    <div className="my-4 border">
      <div className="flex items-center px-4 py-2">
        {expandable && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-6 w-6 p-0 mr-2"
            title={expanded ? 'Collapse' : 'Expand'}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        )}
        {title}
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenInIDE();
          }}
          className="h-6 w-6 p-0 ml-2"
          title="Open in IDE"
          disabled={diff.change === 'deleted'}
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
        </Button>
      </div>

      {expanded && diffFile && (
        <div>
          <DiffView
            diffFile={diffFile}
            diffViewWrap={false}
            diffViewTheme={theme}
            diffViewHighlight
            diffViewMode={DiffModeEnum.Unified}
            diffViewFontSize={12}
          />
        </div>
      )}
      {expanded && !diffFile && (
        <div
          className="px-4 pb-4 text-xs font-mono"
          style={{ color: 'hsl(var(--muted-foreground) / 0.9)' }}
        >
          {isContentEqual
            ? diff.change === 'renamed'
              ? 'File renamed with no content changes.'
              : diff.change === 'permissionChange'
                ? 'File permission changed.'
                : 'No content changes to display.'
            : 'Failed to render diff for this file.'}
        </div>
      )}
    </div>
  );
}
