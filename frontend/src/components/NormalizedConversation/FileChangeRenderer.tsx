import { ThemeMode, type FileChange } from 'shared/types';
import { useConfig } from '@/components/config-provider';
import { Button } from '@/components/ui/button';
import {
  ChevronRight,
  ChevronUp,
  Trash2,
  ArrowLeftRight,
  ArrowRight,
} from 'lucide-react';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import EditDiffRenderer from './EditDiffRenderer';
import FileContentView from './FileContentView';
import '@/styles/diff-style-overrides.css';
import { useExpandable } from '@/stores/useExpandableStore';

type Props = {
  path: string;
  change: FileChange;
  expansionKey: string;
};

function isWrite(
  change: FileChange
): change is Extract<FileChange, { action: 'write'; content: string }> {
  return change?.action === 'write';
}
function isDelete(
  change: FileChange
): change is Extract<FileChange, { action: 'delete' }> {
  return change?.action === 'delete';
}
function isRename(
  change: FileChange
): change is Extract<FileChange, { action: 'rename'; new_path: string }> {
  return change?.action === 'rename';
}
function isEdit(
  change: FileChange
): change is Extract<FileChange, { action: 'edit' }> {
  return change?.action === 'edit';
}

const FileChangeRenderer = ({ path, change, expansionKey }: Props) => {
  const { config } = useConfig();
  const [expanded, setExpanded] = useExpandable(expansionKey, false);

  let theme: 'light' | 'dark' | undefined = 'light';
  if (config?.theme === ThemeMode.DARK) theme = 'dark';

  // Edit: delegate to EditDiffRenderer for identical styling and behavior
  if (isEdit(change)) {
    return (
      <EditDiffRenderer
        path={path}
        unifiedDiff={change.unified_diff}
        hasLineNumbers={change.has_line_numbers}
        expansionKey={expansionKey}
      />
    );
  }

  // Title row content and whether the row is expandable
  const { titleNode, expandable } = (() => {
    const commonTitleClass = 'text-xs font-mono overflow-x-auto flex-1';
    const commonTitleStyle = {
      color: 'hsl(var(--muted-foreground) / 0.7)',
    };

    if (isDelete(change)) {
      return {
        titleNode: (
          <p className={commonTitleClass} style={commonTitleStyle}>
            <Trash2 className="h-3 w-3 inline mr-1.5" aria-hidden />
            Delete <span className="ml-1">{path}</span>
          </p>
        ),
        expandable: false,
      };
    }

    if (isRename(change)) {
      return {
        titleNode: (
          <p className={commonTitleClass} style={commonTitleStyle}>
            <ArrowLeftRight className="h-3 w-3 inline mr-1.5" aria-hidden />
            Rename <span className="ml-1">{path}</span>{' '}
            <ArrowRight className="h-3 w-3 inline mx-1" aria-hidden />{' '}
            <span>{change.new_path}</span>
          </p>
        ),
        expandable: false,
      };
    }

    if (isWrite(change)) {
      return {
        titleNode: (
          <p className={commonTitleClass} style={commonTitleStyle}>
            Write to <span className="ml-1">{path}</span>
          </p>
        ),
        expandable: true,
      };
    }

    // No fallback: render nothing for unknown change types
    return {
      titleNode: null,
      expandable: false,
    };
  })();

  // nothing to display
  if (!titleNode) {
    return null;
  }

  return (
    <div className="my-4 border">
      <div className="flex items-center px-4 py-2">
        {expandable && (
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
        )}

        {titleNode}
      </div>

      {/* Body */}
      {isWrite(change) && expanded && (
        <FileContentView
          content={change.content}
          lang={getHighLightLanguageFromPath(path)}
          theme={theme}
        />
      )}
    </div>
  );
};

export default FileChangeRenderer;
