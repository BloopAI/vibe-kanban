import { useState, useCallback } from 'react';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

interface ToastState {
  toasts: Toast[];
}

const toastState: ToastState = {
  toasts: [],
};

let toastCount = 0;

export function useToast() {
  const [, forceUpdate] = useState({});

  const toast = useCallback(({ title, description, variant = 'default' }: Omit<Toast, 'id'>) => {
    const id = (toastCount++).toString();
    const newToast: Toast = {
      id,
      title,
      description,
      variant,
    };

    toastState.toasts.push(newToast);
    forceUpdate({});

    // Auto-remove toast after 5 seconds
    setTimeout(() => {
      toastState.toasts = toastState.toasts.filter(t => t.id !== id);
      forceUpdate({});
    }, 5000);

    return id;
  }, []);

  const dismiss = useCallback((toastId: string) => {
    toastState.toasts = toastState.toasts.filter(t => t.id !== toastId);
    forceUpdate({});
  }, []);

  return {
    toast,
    dismiss,
    toasts: toastState.toasts,
  };
}