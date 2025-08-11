import { DiffFile, DiffModeEnum, DiffView } from '@git-diff-view/react';
import { ThemeMode } from 'shared/types';
import '../styles/diff-style-overrides.css';
import { useConfig } from './config-provider';

type Props = {
  diffFile: DiffFile;
  key: any;
};

const DiffCard = ({ diffFile, key }: Props) => {
  const { config } = useConfig();

  let theme: 'light' | 'dark' | undefined = 'light';
  if (config?.theme === ThemeMode.DARK) {
    theme = 'dark';
  }

  return (
    <div className="my-4 border" key={key}>
      <p
        className="text-xs font-mono px-4 py-2 overflow-x-auto"
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
