import { type FileChange } from 'shared/types';
import { useUserSystem } from '@/components/config-provider';
import { Trash2, FilePlus2, ArrowRight } from 'lucide-react';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import { getActualTheme } from '@/utils/theme';
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
  const { config } = useUserSystem();
  const [expanded, setExpanded] = useExpandable(expansionKey, false);

  const theme = getActualTheme(config?.theme);

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
  const { titleNode, icon, expandable } = (() => {
    if (isDelete(change)) {
      return {
        titleNode: path,
        icon: <Trash2 className="h-3 w-3" />,
        expandable: false,
      };
    }

    if (isRename(change)) {
      return {
        titleNode: (
          <>
            Rename {path} to {change.new_path}
          </>
        ),
        icon: <ArrowRight className="h-3 w-3" />,
        expandable: false,
      };
    }

    if (isWrite(change)) {
      return {
        titleNode: path,
        icon: <FilePlus2 className="h-3 w-3" />,
        expandable: true,
      };
    }

    // No fallback: render nothing for unknown change types
    return {
      titleNode: null,
      icon: null,
      expandable: false,
    };
  })();

  // nothing to display
  if (!titleNode) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center text-secondary-foreground gap-1.5">
        {icon}
        <p
          onClick={() => expandable && setExpanded()}
          className="text-xs font-mono overflow-x-auto flex-1 cursor-pointer"
        >
          {titleNode}
        </p>
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
