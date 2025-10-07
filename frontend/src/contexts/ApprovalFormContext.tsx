import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
} from 'react';

interface ApprovalFormState {
  isEnteringReason: boolean;
  denyReason: string;
}

interface ApprovalFormStateMap {
  [approvalId: string]: ApprovalFormState;
}

interface ApprovalFormContextType {
  getState: (approvalId: string) => ApprovalFormState;
  setState: (approvalId: string, partial: Partial<ApprovalFormState>) => void;
  clear: (approvalId: string) => void;
  clearAll: () => void;
}

const ApprovalFormContext = createContext<ApprovalFormContextType | null>(null);

const defaultState: ApprovalFormState = {
  isEnteringReason: false,
  denyReason: '',
};

const MAX_CACHED_APPROVALS = 10; // Prevent unbounded growth

export function useApprovalForm(approvalId: string) {
  const context = useContext(ApprovalFormContext);
  if (!context) {
    throw new Error('useApprovalForm must be used within ApprovalFormProvider');
  }

  const state = context.getState(approvalId);

  const setIsEnteringReason = useCallback(
    (value: boolean) =>
      context.setState(approvalId, { isEnteringReason: value }),
    [approvalId, context]
  );

  const setDenyReason = useCallback(
    (value: string) => context.setState(approvalId, { denyReason: value }),
    [approvalId, context]
  );

  const clear = useCallback(
    () => context.clear(approvalId),
    [approvalId, context]
  );

  return {
    isEnteringReason: state.isEnteringReason,
    denyReason: state.denyReason,
    setIsEnteringReason,
    setDenyReason,
    clear,
  };
}

export function ApprovalFormProvider({ children }: { children: ReactNode }) {
  const [stateMap, setStateMap] = useState<ApprovalFormStateMap>({});

  const getState = useCallback(
    (approvalId: string): ApprovalFormState => {
      return stateMap[approvalId] ?? defaultState;
    },
    [stateMap]
  );

  const setState = useCallback(
    (approvalId: string, partial: Partial<ApprovalFormState>) => {
      setStateMap((prev) => {
        const current = prev[approvalId] ?? defaultState;
        const updated = { ...current, ...partial };
        const newMap = { ...prev, [approvalId]: updated };

        // Prune old entries if we exceed the limit
        const keys = Object.keys(newMap);
        if (keys.length > MAX_CACHED_APPROVALS) {
          // Remove the oldest entry (first key)
          const oldestKey = keys[0];
          delete newMap[oldestKey];
        }

        return newMap;
      });
    },
    []
  );

  const clear = useCallback((approvalId: string) => {
    setStateMap((prev) => {
      const newMap = { ...prev };
      delete newMap[approvalId];
      return newMap;
    });
  }, []);

  const clearAll = useCallback(() => {
    setStateMap({});
  }, []);

  return (
    <ApprovalFormContext.Provider
      value={{
        getState,
        setState,
        clear,
        clearAll,
      }}
    >
      {children}
    </ApprovalFormContext.Provider>
  );
}
