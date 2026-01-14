import { cn } from '@/lib/utils';

export function DisplayTruncatedPath({ path }: { path: string }) {
  const isWindows = path.includes('\\');
  const parts = isWindows ? path.split('\\') : path.split('/');

  return (
    <div className="h-[1lh] overflow-hidden">
      <div className="flex flex-row-reverse flex-wrap justify-end relative pl-2">
        <ElipsisComponent className="bottom-[1lh]" />
        <ElipsisComponent className="bottom-[2lh]" />
        <ElipsisComponent className="bottom-[3lh]" />
        <ElipsisComponent className="bottom-[4lh]" />
        <ElipsisComponent className="bottom-[5lh]" />
        <ElipsisComponent className="bottom-[6lh]" />
        <ElipsisComponent className="bottom-[7lh]" />
        <ElipsisComponent className="bottom-[8lh]" />
        <ElipsisComponent className="bottom-[9lh]" />
        <ElipsisComponent className="bottom-[10lh]" />

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

const ElipsisComponent = ({ className }: { className: string }) => {
  return (
    <div
      className={cn('absolute -translate-x-full tracking-tighter', className)}
    >
      ...
    </div>
  );
};
