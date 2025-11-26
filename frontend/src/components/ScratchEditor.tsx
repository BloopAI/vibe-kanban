import { useEffect, useState } from 'react';
import { useScratch } from '@/hooks/useScratch';
import type { ScratchType } from '@/lib/api';

interface ScratchEditorProps {
  scratchType: ScratchType;
  scratchId: string;
}

export const ScratchEditor = ({
  scratchType,
  scratchId,
}: ScratchEditorProps) => {
  const { scratch, isConnected, updateScratch } = useScratch(
    scratchType,
    scratchId
  );

  const [localContent, setLocalContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (scratch?.payload?.data?.md) {
      setLocalContent(scratch.payload.data.md);
    }
  }, [scratch?.payload, scratchId]);

  useEffect(() => {
    if (!scratchId || !scratch) return;

    const currentMd = scratch.payload?.data?.md || '';
    if (localContent === currentMd) return;

    const handle = window.setTimeout(async () => {
      setIsSaving(true);
      setSaveError(null);

      try {
        await updateScratch({
          payload: {
            type: scratch.payload.type,
            data: {
              json: scratch.payload.data.json ?? null,
              md: localContent,
            },
          },
        });
      } catch (e) {
        console.error('Failed to auto-save scratch', e);
        setSaveError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setIsSaving(false);
      }
    }, 500);

    return () => window.clearTimeout(handle);
  }, [localContent, scratchId, scratch, updateScratch]);

  if (!scratch) {
    return <div>Loading scratch...</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <span className="font-mono text-xs mr-3">
            Type: {scratch.payload.type}
          </span>
          {isSaving && <span>Saving...</span>}
          {!isSaving && isConnected && (
            <span className="text-green-600">Connected</span>
          )}
          {!isSaving && !isConnected && (
            <span className="text-red-600">Disconnected</span>
          )}
          {saveError && (
            <span className="text-red-600">Error: {saveError}</span>
          )}
        </div>
      </div>
      <textarea
        value={localContent}
        onChange={(e) => setLocalContent(e.target.value)}
        className="w-full min-h-32 p-2 border rounded font-mono text-sm"
        placeholder="Type your content..."
      />
      <div className="text-xs text-gray-500">
        Last updated: {new Date(scratch.updated_at as string).toLocaleString()}
      </div>
    </div>
  );
};
