import { Button } from '@/components/ui/button.tsx';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { FileDiff } from 'shared/types';
import { Dispatch, SetStateAction, useMemo } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

type Props = {
  collapsedFiles: Set<string>;
  deletable: boolean;
  file: FileDiff;
  setCollapsedFiles: Dispatch<SetStateAction<Set<string>>>;
  stateKey?: string; // Optional key for state management, defaults to file.path
};

function DiffFile({
  collapsedFiles,
  file,
  deletable,
  setCollapsedFiles,
  stateKey,
}: Props) {
  const fileStateKey = stateKey || file.path;

  const toggleFileCollapse = (filePath: string) => {
    setCollapsedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(filePath)) {
        newSet.delete(filePath);
      } else {
        newSet.add(filePath);
      }
      return newSet;
    });
  };

  const { oldValue, newValue } = useMemo(() => {
    let oldLines: string[] = [];
    let newLines: string[] = [];

    file.chunks.forEach((chunk) => {
      const lines = chunk.content.split('\n');
      lines.forEach((line, index) => {
        if (index < lines.length - 1 || line !== '') {
          if (chunk.chunk_type !== 'Insert') {
            oldLines.push(line);
          }
          if (chunk.chunk_type !== 'Delete') {
            newLines.push(line);
          }
        }
      });
    });

    return {
      oldValue: oldLines.join('\n'),
      newValue: newLines.join('\n'),
    };
  }, [file.chunks]);

  return (
    <div
      className={`border rounded-lg ${
        collapsedFiles.has(fileStateKey)
          ? 'border-muted overflow-hidden'
          : 'border-border'
      }`}
    >
      <div
        className={`bg-muted px-3 py-1.5 flex items-center justify-between ${
          !collapsedFiles.has(fileStateKey) ? 'border-b' : ''
        }`}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleFileCollapse(fileStateKey)}
            className="h-5 w-5 p-0 hover:bg-muted-foreground/10"
            title={
              collapsedFiles.has(fileStateKey) ? 'Expand diff' : 'Collapse diff'
            }
          >
            {collapsedFiles.has(fileStateKey) ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronUp className="h-3 w-3" />
            )}
          </Button>
          <p className="text-xs font-medium text-muted-foreground font-mono">
            {file.path}
          </p>
          {collapsedFiles.has(fileStateKey) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
              {(() => {
                const insertCount = file.chunks.filter(
                  (c) => c.chunk_type === 'Insert'
                ).length;
                const deleteCount = file.chunks.filter(
                  (c) => c.chunk_type === 'Delete'
                ).length;
                return (
                  <>
                    {insertCount > 0 && (
                      <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-1 py-0.5 rounded text-xs">
                        +{insertCount}
                      </span>
                    )}
                    {deleteCount > 0 && (
                      <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-1 py-0.5 rounded text-xs">
                        -{deleteCount}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
        {deletable && (
          <Button
            variant="ghost"
            size="sm"
            disabled={true}
            className="text-red-600 hover:text-red-800 hover:bg-red-50 h-6 px-2 gap-1"
            title={`Delete ${file.path}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      {!collapsedFiles.has(fileStateKey) && (
        <div className="overflow-x-auto">
          <ReactDiffViewer
            oldValue={oldValue}
            newValue={newValue}
            compareMethod={DiffMethod.WORDS}
            splitView={true}
            hideLineNumbers={false}
            styles={{
              variables: {
                dark: {
                  addedBackground: '#22c55e20',
                  removedBackground: '#ef444420',
                  wordAddedBackground: '#22c55e40',
                  wordRemovedBackground: '#ef444440',
                },
                light: {
                  addedBackground: '#22c55e20',
                  removedBackground: '#ef444420',
                  wordAddedBackground: '#22c55e40',
                  wordRemovedBackground: '#ef444440',
                },
              },
              line: {
                fontSize: '0.75rem',
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
              },
            }}
          />
        </div>
      )}
    </div>
  );
}

export default DiffFile;
