import { AlertTriangle } from 'lucide-react';

export function DevBanner() {
  // Only show in development mode
  if (import.meta.env.MODE !== 'development') {
    return null;
  }

  return (
    <div className="bg-orange-500 text-white text-center py-2 px-4 text-sm font-medium border-b border-orange-600">
      <div className="flex items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        <span>Development Mode - This is a development build</span>
      </div>
    </div>
  );
}
