import { useState, useEffect } from 'react';
import { EditorType } from 'shared/types';
import { configApi } from '@/lib/api';

export type EditorAvailabilityStatus =
  | 'checking'
  | 'available'
  | 'unavailable'
  | null;

export interface EditorAvailability {
  status: EditorAvailabilityStatus;
  installUrl?: string | null;
}

/**
 * Hook to check if an editor is available on the system.
 * Automatically checks when the editor type changes.
 * Returns an object with status and optional installUrl.
 */
export function useEditorAvailability(
  editorType: EditorType | null | undefined
): EditorAvailability {
  const [availability, setAvailability] = useState<EditorAvailability>({
    status: null,
  });

  useEffect(() => {
    // Don't check for Custom editor or if no editor type
    if (!editorType || editorType === EditorType.CUSTOM) {
      setAvailability({ status: null });
      return;
    }

    const checkAvailability = async () => {
      setAvailability({ status: 'checking' });
      try {
        const result = await configApi.checkEditorAvailability(editorType);
        setAvailability({
          status: result.available ? 'available' : 'unavailable',
          installUrl: result.install_url,
        });
      } catch (error) {
        console.error('Failed to check editor availability:', error);
        setAvailability({ status: null });
      }
    };

    checkAvailability();
  }, [editorType]);

  return availability;
}
