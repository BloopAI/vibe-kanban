import { useMemo } from 'react';
import { DiffView, DiffModeEnum } from '@git-diff-view/react';
import { generateDiffFile } from '@git-diff-view/file';
import '@/styles/diff-style-overrides.css';
import '@/styles/edit-diff-overrides.css';

type Props = {
  content: string;
  lang: string | null;
  theme?: 'light' | 'dark';
  className?: string;
};

/**
 * View syntax highlighted file content.
 */
function FileContentView({ content, lang, theme, className }: Props) {
  // Uses the syntax highlighter from @git-diff-view/react without any diff-related features.
  // This allows uniform styling with EditDiffRenderer.
  const diffFile = useMemo(() => {
    try {
      const instance = generateDiffFile(
        '', // old file
        '', // old content (empty)
        '', // new file
        content, // new content
        '', // old lang
        lang || 'plaintext' // new lang
      );
      instance.initRaw();
      return instance;
    } catch {
      return null;
    }
  }, [content, lang]);

  return (
    <div
      className={['plain-file-content edit-diff-hide-nums', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="px-4 py-2">
        {diffFile ? (
          <DiffView
            diffFile={diffFile}
            diffViewWrap={false}
            diffViewTheme={theme}
            diffViewHighlight
            diffViewMode={DiffModeEnum.Unified}
            diffViewFontSize={12}
          />
        ) : (
          <pre className="text-xs font-mono overflow-x-auto whitespace-pre">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

export default FileContentView;
