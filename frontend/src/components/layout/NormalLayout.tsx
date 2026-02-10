import { Outlet, useSearchParams } from 'react-router-dom';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/Navbar';
import { isElectronDesktopApp } from '@/utils/runtime';

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';
  const isElectronDesktop = isElectronDesktopApp();
  const electronTopInset = isElectronDesktop ? 40 : 0;

  return (
    <>
      <div
        className="relative flex flex-col"
        style={{
          height: electronTopInset ? `calc(100vh - ${electronTopInset}px)` : '100vh',
          paddingTop: electronTopInset || undefined,
        }}
      >
        {isElectronDesktop ? (
          <div className="electron-drag-region absolute top-0 left-0 right-0 h-10" />
        ) : null}
        <DevBanner />
        {!shouldHideNavbar && <Navbar />}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </>
  );
}
