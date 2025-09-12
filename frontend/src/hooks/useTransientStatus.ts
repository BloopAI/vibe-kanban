import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'offline'
  | 'sent'
  | 'conflicted';

export function useTransientStatus() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isStatusFading, setIsStatusFading] = useState(false);
  const statusFadeTimerRef = useRef<number | undefined>(undefined);
  const statusClearTimerRef = useRef<number | undefined>(undefined);

  const clearTimers = useCallback(() => {
    if (statusFadeTimerRef.current)
      window.clearTimeout(statusFadeTimerRef.current);
    if (statusClearTimerRef.current)
      window.clearTimeout(statusClearTimerRef.current);
  }, []);

  const scheduleSaved = useCallback(() => {
    clearTimers();
    setIsStatusFading(false);
    setSaveStatus('saved');
    statusFadeTimerRef.current = window.setTimeout(
      () => setIsStatusFading(true),
      1800
    );
    statusClearTimerRef.current = window.setTimeout(() => {
      setSaveStatus('idle');
      setIsStatusFading(false);
    }, 2000);
  }, [clearTimers]);

  const scheduleSent = useCallback(() => {
    clearTimers();
    setIsStatusFading(false);
    setSaveStatus('sent');
    statusFadeTimerRef.current = window.setTimeout(
      () => setIsStatusFading(true),
      1800
    );
    statusClearTimerRef.current = window.setTimeout(() => {
      setSaveStatus('idle');
      setIsStatusFading(false);
    }, 2000);
  }, [clearTimers]);

  const scheduleConflict = useCallback(() => {
    clearTimers();
    setIsStatusFading(false);
    setSaveStatus('conflicted');
    statusFadeTimerRef.current = window.setTimeout(
      () => setIsStatusFading(true),
      2800
    );
    statusClearTimerRef.current = window.setTimeout(() => {
      setSaveStatus('idle');
      setIsStatusFading(false);
    }, 3000);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    saveStatus,
    setSaveStatus,
    isStatusFading,
    scheduleSaved,
    scheduleSent,
    scheduleConflict,
  };
}
