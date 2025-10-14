import { Outlet } from 'react-router-dom';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/navbar';

export function NormalLayout({ hideNavbar = false }: { hideNavbar?: boolean }) {
  return (
    <>
      <DevBanner />
      {!hideNavbar && <Navbar />}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </>
  );
}
