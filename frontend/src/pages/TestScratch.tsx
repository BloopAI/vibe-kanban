import { useState } from 'react';
import { useScratch } from '@/hooks/useScratch';
import { ScratchEditor } from '@/components/ScratchEditor';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { ScratchPayload } from 'shared/types';

export function TestScratch() {
  const { scratch, isLoading, isConnected, error } = useScratch();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    setIsCreating(true);
    setCreateError(null);

    const payload: ScratchPayload = {
      type: 'draft_task',
      data: {
        json: {
          source: 'test-page',
          timestamp: Date.now(),
        },
        md: '# New scratch item\n\nEdit me to test real-time sync...',
      },
    };

    try {
      const res = await fetch('/api/scratch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload,
        }),
      });

      if (!res.ok) {
        throw new Error(`Create failed: ${res.statusText}`);
      }
    } catch (e) {
      console.error('Failed to create scratch:', e);
      setCreateError(
        e instanceof Error ? e.message : 'Failed to create scratch'
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (scratchId: string) => {
    if (!confirm('Delete this scratch item?')) return;

    try {
      const res = await fetch(`/api/scratch/${scratchId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error(`Delete failed: ${res.statusText}`);
      }
    } catch (e) {
      console.error('Failed to delete scratch:', e);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Scratch Test</h1>
          <p className="text-sm text-gray-500 mt-1">
            Test real-time WebSocket streaming with typed payloads
          </p>
        </div>
        <div className="text-sm">
          {isConnected && !error && (
            <span className="text-green-600">● WS Connected</span>
          )}
          {!isConnected && !error && (
            <span className="text-yellow-600">● WS Connecting...</span>
          )}
          {error && <span className="text-red-600">● WS Error: {error}</span>}
        </div>
      </div>

      <div className="mb-6 space-y-2">
        <Button onClick={handleCreate} disabled={isCreating}>
          {isCreating ? 'Creating...' : '+ Create Scratch Item'}
        </Button>
        {createError && (
          <div className="text-sm text-red-600">Error: {createError}</div>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-600">
          <Loader size={16} />
          <span>Loading scratch items...</span>
        </div>
      )}

      {!isLoading && scratch.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg mb-2">No scratch items yet</p>
          <p className="text-sm">
            Create a scratch item to see real-time streaming in action
          </p>
        </div>
      )}

      <div className="space-y-4">
        {scratch.map((item) => (
          <div
            key={item.id}
            className="border rounded-lg p-4 bg-white shadow-sm"
          >
            <div className="flex justify-between items-start mb-3 text-xs text-gray-500">
              <div>
                <span className="font-mono">ID: {item.id}</span>
              </div>
              <div className="flex items-center gap-4">
                <span>
                  Created:{' '}
                  {item.created_at
                    ? new Date(item.created_at as string).toLocaleString()
                    : '—'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(item.id as string)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Delete
                </Button>
              </div>
            </div>

            <ScratchEditor scratchId={item.id as string} />
          </div>
        ))}
      </div>

      {scratch.length > 0 && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
          <strong>Tip:</strong> Open this page in multiple tabs or windows to
          see real-time synchronization. Changes made in one tab will appear in
          others after ~500ms debounce.
        </div>
      )}
    </div>
  );
}
