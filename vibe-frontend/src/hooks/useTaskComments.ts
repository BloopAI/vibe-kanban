import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { tasksApi } from "../lib/api";
import type {
  CreateTaskComment,
  UpdateTaskComment,
} from "../../../shared/types";

export function useTaskComments(taskId: string | null) {
  const queryClient = useQueryClient();

  const commentsQuery = useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: async () => {
      if (!taskId) return [];
      return tasksApi.getComments(taskId);
    },
    enabled: !!taskId,
    // Cache comments for 30 seconds - show stale data immediately
    staleTime: 30 * 1000,
    // Keep in cache for 5 minutes
    gcTime: 5 * 60 * 1000,
    // Keep previous data while fetching new task's comments
    placeholderData: keepPreviousData,
  });

  const createCommentMutation = useMutation({
    mutationFn: async (payload: CreateTaskComment) => {
      if (!taskId) throw new Error("Task ID is required");
      return tasksApi.createComment(taskId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({
      commentId,
      payload,
    }: {
      commentId: string;
      payload: UpdateTaskComment;
    }) => {
      if (!taskId) throw new Error("Task ID is required");
      return tasksApi.updateComment(taskId, commentId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      if (!taskId) throw new Error("Task ID is required");
      await tasksApi.deleteComment(taskId, commentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
    },
  });

  return {
    comments: commentsQuery.data ?? [],
    isLoading: commentsQuery.isLoading,
    isFetching: commentsQuery.isFetching,
    error: commentsQuery.error,
    createComment: createCommentMutation.mutateAsync,
    updateComment: updateCommentMutation.mutateAsync,
    deleteComment: deleteCommentMutation.mutateAsync,
    isCreating: createCommentMutation.isPending,
    isUpdating: updateCommentMutation.isPending,
    isDeleting: deleteCommentMutation.isPending,
  };
}
