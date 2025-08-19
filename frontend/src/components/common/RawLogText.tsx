import { memo } from 'react';
import { AnsiHtml } from 'fancy-ansi/react';
import { hasAnsi } from 'fancy-ansi';
import { clsx } from 'clsx';

interface RawLogTextProps {
  content: string;
  channel?: 'stdout' | 'stderr';
  as?: 'div' | 'span';
  className?: string;
}

const RawLogText = memo(
  ({
    content,
    channel = 'stdout',
    as: Component = 'div',
    className,
  }: RawLogTextProps) => {
    // Only apply stderr fallback color when no ANSI codes are present
    const hasAnsiCodes = hasAnsi(content);
    const shouldApplyStderrFallback = channel === 'stderr' && !hasAnsiCodes;

    return (
      <Component
        className={clsx(
          'font-mono text-xs break-all whitespace-pre-wrap',
          shouldApplyStderrFallback && 'text-red-600',
          className
        )}
      >
        <AnsiHtml text={content} />
      </Component>
    );
  }
);

RawLogText.displayName = 'RawLogText';

export default RawLogText;
