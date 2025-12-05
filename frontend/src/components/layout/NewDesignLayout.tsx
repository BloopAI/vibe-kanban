import { Outlet } from 'react-router-dom';

export function NewDesignLayout() {
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <Outlet />
    </div>
  );
}
