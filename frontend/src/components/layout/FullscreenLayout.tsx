import { Outlet } from 'react-router-dom';

export function FullscreenLayout() {
  return (
    <div className="flex-1 h-full overflow-y-auto">
      <Outlet />
    </div>
  );
}
