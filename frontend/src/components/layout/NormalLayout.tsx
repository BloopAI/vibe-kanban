import { Outlet, useSearchParams } from 'react-router-dom';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/navbar';

export function NormalLayout({ hideNavbar = false }: { hideNavbar?: boolean }) {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const isPreviewOrDiffMode = view === 'preview' || view === 'diffs';
  const shouldHideNavbar = hideNavbar || isPreviewOrDiffMode;

  return (
    <>
      <DevBanner />
      {!shouldHideNavbar && <Navbar />}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </>
  );
}
