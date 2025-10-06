import React from 'react';

interface ResponsiveTwoPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  isRightOpen: boolean;
}

export function ResponsiveTwoPane({
  left,
  right,
  isRightOpen,
}: ResponsiveTwoPaneProps) {
  return (
    <div className="h-full min-h-0 grid xl:grid-cols-[1fr_600px]">
      <div className="min-w-0">{left}</div>

      {isRightOpen && (
        <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm xl:hidden" />
      )}

      <aside
        className={[
          'bg-background border-l overflow-auto min-h-0',
          'xl:block xl:h-full xl:static',
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
