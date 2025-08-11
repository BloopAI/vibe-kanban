import { DiffFile, DiffModeEnum, DiffView } from '@git-diff-view/react';
import { ThemeMode } from 'shared/types';
import '../styles/diff-style-overrides.css';
import { useConfig } from './config-provider';
import { useContext } from 'react';
import { TaskSelectedAttemptContext } from './context/taskDetailsContext';
import { Button } from './ui/button';
import { FolderOpen } from 'lucide-react';
import { attemptsApi } from '@/lib/api';

type Props = {
  diffFile: DiffFile;
  key: any;
};

const DiffCard = ({ diffFile, key }: Props) => {
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
      <div className="flex items-center justify-between px-4 py-2">
        <p
          className="text-xs font-mono overflow-x-auto flex-1"
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
        <Button
          variant="ghost"
          size="sm"
          onClick={handleOpenInIDE}
          className="h-6 w-6 p-0 ml-2"
          title="Open in IDE"
        >
          <FolderOpen className="h-3 w-3" />
        </Button>
      </div>
      <DiffView
        diffFile={diffFile}
        diffViewWrap={false}
        diffViewTheme={theme}
        diffViewHighlight
        diffViewMode={DiffModeEnum.Unified}
        diffViewFontSize={12}
      />
    </div>
  );
};

export default DiffCard;
