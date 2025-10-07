import React from 'react';

interface ResponsiveTwoPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  isRightOpen: boolean;
  variant?: 'sidebar' | 'split';
}

export function ResponsiveTwoPane({
  left,
  right,
  isRightOpen,
  variant = 'sidebar',
}: ResponsiveTwoPaneProps) {
  if (variant === 'split') {
    return (
      <div className="h-full min-h-0 grid grid-cols-2">
        <div className="min-w-0 border-r overflow-auto">{left}</div>
        <div className="min-w-0 overflow-auto">{right}</div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden grid xl:grid-cols-[1fr_600px]">
      <div className="min-w-0 min-h-0">{left}</div>

      {isRightOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm xl:hidden" />
      )}

      <aside
        className={[
          'bg-background border-l min-h-0 min-w-0 flex flex-col overflow-hidden',
          'xl:static xl:block xl:h-full',
          isRightOpen
            ? 'fixed inset-y-0 right-0 left-auto w-full md:w-[600px] z-50 shadow-xl'
            : 'hidden',
        ].join(' ')}
      >
        {right}
      </aside>
    </div>
  );
}

export default ResponsiveTwoPane;
