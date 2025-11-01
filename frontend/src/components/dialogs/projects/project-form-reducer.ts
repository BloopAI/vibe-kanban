import { DirectoryEntry, CreateProject } from 'shared/types';

export type Mode = 'existing' | 'new';

type ChoosingSourceState = { tag: 'choosingSource'; mode: 'existing' };
type ListingState = { tag: 'listing'; mode: 'existing'; query?: string };
type ListedState = {
  tag: 'listed';
  mode: 'existing';
  entries: DirectoryEntry[];
  window: number;
};
type EditingNewState = { tag: 'editingNew'; mode: 'new' };

export type BaseState =
  | ChoosingSourceState
  | ListingState
  | ListedState
  | EditingNewState;

type ErrorState = {
  tag: 'error';
  mode: Mode;
  message: string;
  prev: BaseState;
};
type SubmittingState = {
  tag: 'submitting';
  mode: Mode;
  payload: CreateProject;
  prev: BaseState;
};

export type ProjectFormState = BaseState | ErrorState | SubmittingState;

export type ProjectFormEvent =
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'OPEN_EXISTING' }
  | { type: 'LIST_REQUEST'; query?: string }
  | { type: 'LIST_SUCCESS'; entries: DirectoryEntry[] }
  | { type: 'LIST_FAILURE'; message: string }
  | { type: 'EXPAND_WINDOW' }
  | { type: 'SUBMIT'; payload: CreateProject }
  | { type: 'SUBMIT_SUCCESS' }
  | { type: 'SUBMIT_FAILURE'; message: string }
  | { type: 'CANCEL' }
  | { type: 'DISMISS_ERROR' };

export const LIST_WINDOW_INCREMENT = 6;

export const initialProjectFormState: ProjectFormState = {
  tag: 'choosingSource',
  mode: 'existing',
};

const devAssert = (condition: boolean, message: string): void => {
  if (import.meta.env.DEV && !condition) {
    throw new Error(`[project-form] ${message}`);
  }
};

function getActiveBaseState(state: ProjectFormState): BaseState {
  if (state.tag === 'error' || state.tag === 'submitting') {
    return state.prev;
  }
  return state;
}

function clampWindow(entries: DirectoryEntry[], window: number): number {
  if (entries.length === 0) return 0;
  return Math.min(entries.length, Math.max(LIST_WINDOW_INCREMENT, window));
}

export function projectFormReducer(
  state: ProjectFormState,
  event: ProjectFormEvent
): ProjectFormState {
  switch (event.type) {
    case 'SET_MODE': {
      return event.mode === 'existing'
        ? { tag: 'choosingSource', mode: 'existing' }
        : { tag: 'editingNew', mode: 'new' };
    }

    case 'OPEN_EXISTING': {
      const base = getActiveBaseState(state);
      const isListingBase = base.tag === 'listing';
      devAssert(
        base.mode === 'existing' && !isListingBase,
        'OPEN_EXISTING only allowed from non-listing existing states'
      );
      return { tag: 'choosingSource', mode: 'existing' };
    }

    case 'LIST_REQUEST': {
      const base = getActiveBaseState(state);
      devAssert(
        base.mode === 'existing',
        'LIST_REQUEST only allowed in existing mode'
      );
      return { tag: 'listing', mode: 'existing', query: event.query };
    }

    case 'LIST_SUCCESS': {
      if (state.tag !== 'listing') {
        devAssert(false, 'LIST_SUCCESS requires listing state');
        return state;
      }
      const window = clampWindow(event.entries, LIST_WINDOW_INCREMENT);
      return {
        tag: 'listed',
        mode: 'existing',
        entries: event.entries,
        window,
      };
    }

    case 'LIST_FAILURE': {
      if (state.tag !== 'listing') {
        devAssert(false, 'LIST_FAILURE requires listing state');
        return state;
      }
      return {
        tag: 'error',
        mode: 'existing',
        message: event.message,
        prev: { tag: 'choosingSource', mode: 'existing' },
      };
    }

    case 'EXPAND_WINDOW': {
      if (state.tag !== 'listed') {
        devAssert(false, 'EXPAND_WINDOW requires listed state');
        return state;
      }
      const nextWindow = clampWindow(
        state.entries,
        state.window + LIST_WINDOW_INCREMENT
      );
      return { ...state, window: nextWindow };
    }

    case 'SUBMIT': {
      const base = getActiveBaseState(state);
      if (!isSubmitAllowedBase(base)) {
        devAssert(
          false,
          'SUBMIT only allowed from listed (existing) or editingNew (new) states'
        );
        return state;
      }
      return {
        tag: 'submitting',
        mode: base.mode,
        payload: event.payload,
        prev: base,
      };
    }

    case 'SUBMIT_SUCCESS': {
      if (state.tag !== 'submitting') {
        devAssert(false, 'SUBMIT_SUCCESS requires submitting state');
        return state;
      }
      return initialProjectFormState;
    }

    case 'SUBMIT_FAILURE': {
      if (state.tag !== 'submitting') {
        devAssert(false, 'SUBMIT_FAILURE requires submitting state');
        return state;
      }
      return {
        tag: 'error',
        mode: state.prev.mode,
        message: event.message,
        prev: state.prev,
      };
    }

    case 'CANCEL': {
      return initialProjectFormState;
    }

    case 'DISMISS_ERROR': {
      if (state.tag !== 'error') {
        devAssert(false, 'DISMISS_ERROR requires error state');
        return state;
      }
      return state.prev;
    }

    default:
      return state;
  }
}

export type ExistingView =
  | { status: 'hidden' }
  | { status: 'choosingSource'; error?: string }
  | { status: 'listing'; error?: string }
  | {
      status: 'listed';
      entries: DirectoryEntry[];
      window: number;
      error?: string;
    };

export type NewView =
  | { status: 'hidden' }
  | { status: 'editing'; error?: string };

export function selectExistingView(state: ProjectFormState): ExistingView {
  const base = getActiveBaseState(state);
  if (base.mode !== 'existing') {
    return { status: 'hidden' };
  }

  const error =
    state.tag === 'error' && state.mode === 'existing'
      ? state.message
      : undefined;

  switch (base.tag) {
    case 'choosingSource':
      return { status: 'choosingSource', error };
    case 'listing':
      return { status: 'listing', error };
    case 'listed':
      return {
        status: 'listed',
        entries: base.entries,
        window: base.window,
        error,
      };
    default:
      return { status: 'hidden' };
  }
}

export function selectNewView(state: ProjectFormState): NewView {
  const base = getActiveBaseState(state);
  if (base.mode !== 'new') {
    return { status: 'hidden' };
  }

  const error =
    state.tag === 'error' && state.mode === 'new' ? state.message : undefined;

  return { status: 'editing', error };
}

export function isSubmitting(
  state: ProjectFormState
): state is SubmittingState {
  return state.tag === 'submitting';
}

export { getActiveBaseState };

function isSubmitAllowedBase(
  base: BaseState
): base is ListedState | EditingNewState {
  return base.tag === 'listed' || base.tag === 'editingNew';
}
