import { Outlet, useSearchParams } from 'react-router-dom';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideChrome = view === 'preview' || view === 'diffs';

  if (shouldHideChrome) {
    return (
      <>
        <DevBanner />
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </>
    );
  }

  return (
    <>
      <DevBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Navbar />
          <div className="flex-1 min-h-0 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  );
}
