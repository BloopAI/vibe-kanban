import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/lib/api";
import { LinkedDocument } from "shared/types";

export function useTaskDocumentLinks(taskId: string | undefined) {
  const queryClient = useQueryClient();

  const linksQuery = useQuery({
    queryKey: ["task-document-links", taskId],
    queryFn: async () => {
      if (!taskId) return [];
      return tasksApi.getLinks(taskId);
    },
    enabled: !!taskId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
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
