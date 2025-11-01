import { useEffect, useReducer, useRef, type Dispatch } from 'react';

import { useProjectMutations } from '@/hooks/useProjectMutations';
import { fileSystemApi } from '@/lib/api';

import {
  initialProjectFormState,
  isSubmitting,
  projectFormReducer,
  type ProjectFormEvent,
} from './project-form-reducer';

interface UseProjectFormControllerOptions {
  onSuccess: () => void;
}

export function useProjectFormController({
  onSuccess,
}: UseProjectFormControllerOptions) {
  const [state, dispatch] = useReducer(
    projectFormReducer,
    initialProjectFormState
  );
  const listingAbortRef = useRef<AbortController | null>(null);

  const submitting = isSubmitting(state);

  const { createProject } = useProjectMutations({
    onCreateSuccess: () => {
      dispatch({ type: 'SUBMIT_SUCCESS' });
      onSuccess();
    },
    onCreateError: (err) => {
      dispatch({
        type: 'SUBMIT_FAILURE',
        message:
          err instanceof Error ? err.message : 'Failed to create project',
      });
    },
  });

  useEffect(() => {
    if (state.tag !== 'listing') {
      listingAbortRef.current?.abort();
      listingAbortRef.current = null;
      return;
    }

    const controller = new AbortController();
    listingAbortRef.current?.abort();
    listingAbortRef.current = controller;

    fileSystemApi
      .listGitRepos()
      .then((entries) => {
        if (controller.signal.aborted) return;
        dispatch({ type: 'LIST_SUCCESS', entries });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        dispatch({
          type: 'LIST_FAILURE',
          message:
            err instanceof Error ? err.message : 'Failed to load repositories',
        });
      });

    return () => {
      controller.abort();
    };
  }, [state.tag]);

  useEffect(() => {
    if (state.tag !== 'submitting') return;
    createProject.mutate(state.payload);
  }, [state, createProject]);

  const enhancedDispatch: Dispatch<ProjectFormEvent> = (event) => {
    if (event.type === 'DISMISS_ERROR' && state.tag !== 'error') {
      return;
    }
    dispatch(event);
  };

  return {
    state,
    dispatch: enhancedDispatch,
    submitting,
  };
}
