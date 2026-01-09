import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/lib/api";
import { LinkedDocument } from "shared/types";

// Helper to detect rate limit errors
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') || msg.includes('too many requests');
  }
  return false;
}

export function useTaskDocumentLinks(taskId: string | undefined) {
  const queryClient = useQueryClient();

  const linksQuery = useQuery({
    queryKey: ["task-document-links", taskId],
    queryFn: async () => {
      if (!taskId) return [];
      return tasksApi.getLinks(taskId);
    },
    enabled: !!taskId,
    // Cache links for 5 minutes to reduce API calls
    staleTime: 5 * 60 * 1000,
    // Keep in cache for 15 minutes
    gcTime: 15 * 60 * 1000,
    // Don't retry rate limit errors
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 2;
    },
    // Don't refetch on window focus
    refetchOnWindowFocus: false,
  });

  const linkDocumentsMutation = useMutation({
    mutationFn: async (documentIds: string[]) => {
      if (!taskId) throw new Error("Task ID required");
      return tasksApi.linkDocuments(taskId, { document_ids: documentIds });
    },
    onSuccess: (newLinks) => {
      queryClient.setQueryData<LinkedDocument[]>(
        ["task-document-links", taskId],
        (old) => {
          if (!old) return newLinks;
          // Merge new links avoiding duplicates
          const existingIds = new Set(old.map((l) => l.document_id));
          const uniqueNewLinks = newLinks.filter(
            (l) => !existingIds.has(l.document_id)
          );
          return [...old, ...uniqueNewLinks];
        }
      );
    },
  });

  const unlinkDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      if (!taskId) throw new Error("Task ID required");
      return tasksApi.unlinkDocument(taskId, documentId);
    },
    onSuccess: (_, documentId) => {
      queryClient.setQueryData<LinkedDocument[]>(
        ["task-document-links", taskId],
        (old) => old?.filter((l) => l.document_id !== documentId) ?? []
      );
    },
  });

  return {
    links: linksQuery.data ?? [],
    isLoading: linksQuery.isLoading,
    isFetching: linksQuery.isFetching,
    error: linksQuery.error,
    linkDocuments: linkDocumentsMutation.mutateAsync,
    unlinkDocument: unlinkDocumentMutation.mutateAsync,
    isLinking: linkDocumentsMutation.isPending,
    isUnlinking: unlinkDocumentMutation.isPending,
  };
}
