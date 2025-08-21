import { useMemo } from 'react';
import {
  DiffView,
  DiffModeEnum,
  DiffLineType,
  parseInstance,
} from '@git-diff-view/react';
import { ThemeMode } from 'shared/types';
import { ChevronRight, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfig } from '@/components/config-provider';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import '@/styles/diff-style-overrides.css';
import '@/styles/edit-diff-overrides.css';

type Props = {
  path: string;
  unifiedDiff: string;
  hasLineNumbers: boolean;
  expansionKey: string;
};

/**
 * Process hunks for @git-diff-view/react
 * - Extract additions/deletions for display
 * - Decide whether to hide line numbers based on backend data
 */
function processUnifiedDiff(unifiedDiff: string, hasLineNumbers: boolean) {
  // Hide line numbers when backend says they are unreliable
  const hideNums = !hasLineNumbers;
  let isValidDiff;

  // Pre-compute additions/deletions using the library parser so counts are available while collapsed
  let additions = 0;
  let deletions = 0;
  try {
    const parsed = parseInstance.parse(unifiedDiff);
    for (const h of parsed.hunks) {
      for (const line of h.lines) {
        if (line.type === DiffLineType.Add) additions++;
        else if (line.type === DiffLineType.Delete) deletions++;
      }
    }
    isValidDiff = parsed.hunks.length > 0;
  } catch (err) {
    console.error('Failed to parse diff hunks:', err);
    isValidDiff = false;
  }

  return {
    hunks: [unifiedDiff],
    hideLineNumbers: hideNums,
    additions,
    deletions,
    isValidDiff,
  };
}

import { useExpandable } from '@/stores/useExpandableStore';

function EditDiffRenderer({
  path,
  unifiedDiff,
  hasLineNumbers,
  expansionKey,
}: Props) {
  const { config } = useConfig();
  const [expanded, setExpanded] = useExpandable(expansionKey, false);

  let theme: 'light' | 'dark' | undefined = 'light';
  if (config?.theme === ThemeMode.DARK) {
    theme = 'dark';
  }

  const { hunks, hideLineNumbers, additions, deletions, isValidDiff } = useMemo(
    () => processUnifiedDiff(unifiedDiff, hasLineNumbers),
    [path, unifiedDiff, hasLineNumbers]
  );

  const hideLineNumbersClass = hideLineNumbers ? ' edit-diff-hide-nums' : '';

  const diffData = useMemo(() => {
    const lang = getHighLightLanguageFromPath(path) || 'plaintext';
    return {
      hunks,
      oldFile: { fileName: path, fileLang: lang },
      newFile: { fileName: path, fileLang: lang },
    };
  }, [hunks, path]);

  return (
    <div className="my-4 border">
      <div className="flex items-center px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded()}
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
        <p
          className="text-xs font-mono overflow-x-auto flex-1"
          style={{ color: 'hsl(var(--muted-foreground) / 0.7)' }}
        >
          {path}{' '}
          <span style={{ color: 'hsl(var(--console-success))' }}>
            +{additions}
          </span>{' '}
          <span style={{ color: 'hsl(var(--console-error))' }}>
            -{deletions}
          </span>
        </p>
      </div>

      {expanded && (
        <div className={'mt-2' + hideLineNumbersClass}>
          {isValidDiff ? (
            <DiffView
              data={diffData}
              diffViewWrap={false}
              diffViewTheme={theme}
              diffViewHighlight
              diffViewMode={DiffModeEnum.Unified}
              diffViewFontSize={12}
            />
          ) : (
            <>
              <pre
                className="px-4 pb-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap"
                style={{ color: 'hsl(var(--muted-foreground) / 0.9)' }}
              >
                {unifiedDiff}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default EditDiffRenderer;
