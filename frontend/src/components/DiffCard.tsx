import { DiffFile, DiffModeEnum, DiffView } from '@git-diff-view/react';
import { ThemeMode } from 'shared/types';
import '../styles/diff-style-overrides.css';
import { useConfig } from './config-provider';
import { useContext } from 'react';
import { TaskSelectedAttemptContext } from './context/taskDetailsContext';
import { Button } from './ui/button';
import { FolderOpen, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { attemptsApi } from '@/lib/api';

type Props = {
  diffFile: DiffFile;
  key: any;
  isCollapsed: boolean;
  onToggle: () => void;
};

const DiffCard = ({ diffFile, key, isCollapsed, onToggle }: Props) => {
  const { config } = useConfig();
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);

  let theme: 'light' | 'dark' | undefined = 'light';
  if (config?.theme === ThemeMode.DARK) {
    theme = 'dark';
  }

  const handleOpenInIDE = async () => {
    if (!selectedAttempt?.id) return;
    try {
      await attemptsApi.openEditor(
        selectedAttempt.id,
        undefined,
        diffFile._newFileName
      );
    } catch (error) {
      console.error('Failed to open file in IDE:', error);
    }
  };

  return (
    <div className="my-4 border" key={key}>
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer select-none hover:bg-muted/50 transition-colors"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle()}
        aria-expanded={!isCollapsed}
      >
        <div className="flex items-center gap-2 overflow-x-auto flex-1">
          <ChevronRight
            className={cn('h-4 w-4 transition-transform', {
              'rotate-90': !isCollapsed,
            })}
          />
          <p
            className="text-xs font-mono"
            style={{ color: 'hsl(var(--muted-foreground) / 0.7)' }}
          >
            {diffFile._newFileName}{' '}
            <span style={{ color: 'hsl(var(--console-success))' }}>
              +{diffFile.additionLength}
            </span>{' '}
            <span style={{ color: 'hsl(var(--console-error))' }}>
              -{diffFile.deletionLength}
            </span>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleOpenInIDE();
          }}
          className="h-6 w-6 p-0 ml-2"
          title="Open in IDE"
        >
          <FolderOpen className="h-3 w-3" />
        </Button>
      </div>
      {!isCollapsed && (
        <DiffView
          diffFile={diffFile}
          diffViewWrap={false}
          diffViewTheme={theme}
          diffViewHighlight
          diffViewMode={DiffModeEnum.Unified}
          diffViewFontSize={12}
        />
      )}
    </div>
  );
};

export default DiffCard;
