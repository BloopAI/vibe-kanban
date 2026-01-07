import { cn } from '@/lib/utils';

const ELIPSIS_N = 6;

export function DisplayTruncatedPath({ path }: { path: string }) {
  const isWindows = path.includes('\\');
  const parts = isWindows ? path.split('\\') : path.split('/');

  return (
    <div className="h-[1lh] overflow-hidden">
      <div className="flex flex-row-reverse flex-wrap justify-end relative pl-2">
        {[...Array(ELIPSIS_N)].map((_, i) => (
          <div
            className={cn(
              'absolute -translate-x-full tracking-tighter',
              `bottom-[${i + 1}lh]`
            )}
          >
            ...
          </div>
        ))}
        {parts.reverse().map((part, index) => (
          <span className="flex-none font-ibm-plex-mono " key={index}>
            {isWindows ? '\\' : '/'}
            {part}
          </span>
        ))}
      </div>
    </div>
  );
}
