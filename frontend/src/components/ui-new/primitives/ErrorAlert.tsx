import { cn } from '@/lib/utils';
import { splitLines } from '@/utils/string';

interface ErrorAlertProps {
  message: string;
  className?: string;
}

export function ErrorAlert({ message, className }: ErrorAlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'relative w-full border border-error bg-error/10 p-base text-sm text-error',
        className
      )}
    >
      {splitLines(message).map((line, i, lines) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </div>
  );
}
