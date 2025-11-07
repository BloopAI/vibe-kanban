import { memo } from 'react';
import { AnsiHtml } from 'fancy-ansi/react';
import { hasAnsi } from 'fancy-ansi';
import { clsx } from 'clsx';

interface RawLogTextProps {
  content: string;
  channel?: 'stdout' | 'stderr';
  as?: 'div' | 'span';
  className?: string;
  linkifyUrls?: boolean;
}

const RawLogText = memo(
  ({
    content,
    channel = 'stdout',
    as: Component = 'div',
    className,
    linkifyUrls = false,
  }: RawLogTextProps) => {
    // Only apply stderr fallback color when no ANSI codes are present
    const hasAnsiCodes = hasAnsi(content);
    const shouldApplyStderrFallback = channel === 'stderr' && !hasAnsiCodes;

    const renderContent = () => {
      if (!linkifyUrls) {
        return <AnsiHtml text={content} />;
      }

      const urlRegex = /(https?:\/\/\S+)/g;
      const parts = content.split(urlRegex);

      return parts.map((part, index) => {
        if (/^https?:\/\/\S+$/.test(part)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-info hover:text-info/80 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        // For non-URL parts, apply ANSI formatting
        return <AnsiHtml key={index} text={part} />;
      });
    };

    return (
      <Component
        className={clsx(
          'font-mono text-xs break-all whitespace-pre-wrap',
          shouldApplyStderrFallback && 'text-destructive',
          className
        )}
      >
        {renderContent()}
      </Component>
    );
  }
);

RawLogText.displayName = 'RawLogText';

export default RawLogText;
