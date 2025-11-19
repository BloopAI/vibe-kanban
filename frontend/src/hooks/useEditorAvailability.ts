import { useState, useEffect } from 'react';
import { EditorType } from 'shared/types';
import { configApi } from '@/lib/api';

export type EditorAvailabilityState =
  | 'checking'
  | 'available'
  | 'unavailable'
  | null;

/**
 * Hook to check if an editor is available on the system.
 * Automatically checks when the editor type changes.
 * Returns null for Custom editors (can't pre-validate).
 */
export function useEditorAvailability(
  editorType: EditorType | null | undefined
): EditorAvailabilityState {
  const [availability, setAvailability] =
    useState<EditorAvailabilityState>(null);

  useEffect(() => {
    // Don't check for Custom editor or if no editor type
    if (!editorType || editorType === EditorType.CUSTOM) {
      setAvailability(null);
      return;
    }

    const checkAvailability = async () => {
      setAvailability('checking');
      try {
        const result = await configApi.checkEditorAvailability(editorType);
        setAvailability(result.available ? 'available' : 'unavailable');
      } catch (error) {
        console.error('Failed to check editor availability:', error);
        setAvailability(null);
      }
    };

    checkAvailability();
  }, [editorType]);

  return availability;
}
