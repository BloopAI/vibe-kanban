import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { 
  DiffComment, 
  CreateDiffCommentRequest, 
  UpdateDiffCommentRequest,
  SubmitDraftCommentsRequest 
} from '@/lib/types';

interface DiffCommentsContextType {
  comments: DiffComment[];
  draftComments: DiffComment[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadComments: (taskId: string, attemptId: string) => Promise<void>;
  createComment: (request: CreateDiffCommentRequest) => Promise<DiffComment | null>;
  updateComment: (id: string, request: UpdateDiffCommentRequest) => Promise<DiffComment | null>;
  deleteComment: (id: string) => Promise<boolean>;
  submitDraftComments: (commentIds: string[]) => Promise<{ comments: DiffComment[]; prompt: string } | null>;
  
  // UI state
  selectedLines: { file: string; start: number; end: number } | null;
  setSelectedLines: (selection: { file: string; start: number; end: number } | null) => void;
  isCommentInputOpen: boolean;
  setIsCommentInputOpen: (open: boolean) => void;
}

const DiffCommentsContext = createContext<DiffCommentsContextType | undefined>(undefined);

export const useDiffComments = () => {
  const context = useContext(DiffCommentsContext);
  if (!context) {
    throw new Error('useDiffComments must be used within a DiffCommentsProvider');
  }
  return context;
};

interface DiffCommentsProviderProps {
  children: React.ReactNode;
}

export const DiffCommentsProvider: React.FC<DiffCommentsProviderProps> = ({ children }) => {
  const [comments, setComments] = useState<DiffComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLines, setSelectedLines] = useState<{ file: string; start: number; end: number } | null>(null);
  const [isCommentInputOpen, setIsCommentInputOpen] = useState(false);

  const draftComments = comments.filter(c => c.status === 'draft');

  const loadComments = useCallback(async (taskId: string, attemptId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/attempts/${attemptId}/diff-comments`);
      const jsonResponse = await response.json();
      if (jsonResponse.success && jsonResponse.data) {
        setComments(jsonResponse.data);
      }
    } catch (err) {
      const errorMsg = 'Failed to load comments';
      setError(errorMsg);
      console.error(errorMsg, err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createComment = useCallback(async (request: CreateDiffCommentRequest): Promise<DiffComment | null> => {
    try {
      const response = await fetch('/api/diff-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      const jsonResponse = await response.json();
      if (jsonResponse.success && jsonResponse.data) {
        const newComment = jsonResponse.data;
        setComments(prev => [...prev, newComment]);
        return newComment;
      }
    } catch (err) {
      console.error('Failed to create comment', err);
    }
    return null;
  }, []);

  const updateComment = useCallback(async (id: string, request: UpdateDiffCommentRequest): Promise<DiffComment | null> => {
    try {
      const response = await fetch(`/api/diff-comments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      const jsonResponse = await response.json();
      if (jsonResponse.success && jsonResponse.data) {
        const updatedComment = jsonResponse.data;
        setComments(prev => prev.map(c => c.id === id ? updatedComment : c));
        return updatedComment;
      }
    } catch (err) {
      console.error('Failed to update comment', err);
    }
    return null;
  }, []);

  const deleteComment = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/diff-comments/${id}`, {
        method: 'DELETE'
      });
      const jsonResponse = await response.json();
      if (jsonResponse.success) {
        setComments(prev => prev.filter(c => c.id !== id));
        return true;
      }
    } catch (err) {
      console.error('Failed to delete comment', err);
    }
    return false;
  }, []);

  const submitDraftComments = useCallback(async (commentIds: string[]): Promise<{ comments: DiffComment[]; prompt: string } | null> => {
    try {
      const request: SubmitDraftCommentsRequest = { comment_ids: commentIds };
      const response = await fetch('/api/diff-comments/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      const jsonResponse = await response.json();
      if (jsonResponse.success && jsonResponse.data) {
        const { comments: submittedComments, prompt } = jsonResponse.data;
        // Update local state with submitted comments
        setComments(prev => prev.map(c => {
          const submitted = submittedComments.find((sc: DiffComment) => sc.id === c.id);
          return submitted || c;
        }));
        return { comments: submittedComments, prompt };
      }
    } catch (err) {
      console.error('Failed to submit comments', err);
    }
    return null;
  }, []);

  const value: DiffCommentsContextType = {
    comments,
    draftComments,
    isLoading,
    error,
    loadComments,
    createComment,
    updateComment,
    deleteComment,
    submitDraftComments,
    selectedLines,
    setSelectedLines,
    isCommentInputOpen,
    setIsCommentInputOpen,
  };

  return (
    <DiffCommentsContext.Provider value={value}>
      {children}
    </DiffCommentsContext.Provider>
  );
};