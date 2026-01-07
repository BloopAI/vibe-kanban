import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, FileText, Folder } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { documentsApi } from '@/lib/api';
import type { Document, LinkedDocument } from 'shared/types';
import { cn } from '@/lib/utils';

interface LinkDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  existingLinks: LinkedDocument[];
  onLink: (documentIds: string[]) => Promise<LinkedDocument[] | void>;
  isLinking?: boolean;
}

export function LinkDocumentsDialog({
  open,
  onOpenChange,
  teamId,
  existingLinks,
  onLink,
  isLinking = false,
}: LinkDocumentsDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fetch ALL documents for the team (across all folders)
  const { data: allDocuments = [], isLoading: documentsLoading } = useQuery({
    queryKey: ['all-documents', teamId],
    queryFn: () => documentsApi.list(teamId, { all: true }),
    enabled: open && !!teamId,
  });

  // Fetch folders for grouping
  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ['document-folders', teamId],
    queryFn: () => documentsApi.listFolders(teamId),
    enabled: open && !!teamId,
  });

  const isLoading = documentsLoading || foldersLoading;

  // Reset selections when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set());
      setSearchQuery('');
    }
  }, [open]);

  // Filter documents based on search and exclude already linked
  const filteredDocuments = useMemo(() => {
    const linkedIds = new Set(existingLinks.map((l) => l.document_id));

    let filtered = allDocuments.filter((doc) => !linkedIds.has(doc.id));

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (doc) =>
          doc.title.toLowerCase().includes(query) ||
          (doc.content && doc.content.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [allDocuments, existingLinks, searchQuery]);

  // Group documents by folder
  const documentsByFolder = useMemo(() => {
    const grouped: Record<string, Document[]> = { root: [] };

    for (const doc of filteredDocuments) {
      const folderId = doc.folder_id || 'root';
      if (!grouped[folderId]) {
        grouped[folderId] = [];
      }
      grouped[folderId].push(doc);
    }

    return grouped;
  }, [filteredDocuments]);

  const folderMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const folder of folders) {
      map[folder.id] = folder.name;
    }
    return map;
  }, [folders]);

  const handleToggle = (docId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredDocuments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocuments.map((d) => d.id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) return;
    await onLink(Array.from(selectedIds));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Link Documents</DialogTitle>
          <DialogDescription>
            Select documents to link to this issue. Linked documents appear in
            the issue details.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Document list */}
        <div className="h-[300px] border rounded-md overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading documents...
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {searchQuery
                ? 'No documents match your search'
                : 'No documents available to link'}
            </div>
          ) : (
            <div className="p-2 space-y-3">
              {/* Select all */}
              <div className="flex items-center gap-2 pb-2 border-b">
                <Checkbox
                  id="select-all"
                  checked={
                    selectedIds.size === filteredDocuments.length &&
                    filteredDocuments.length > 0
                  }
                  onCheckedChange={handleSelectAll}
                />
                <label
                  htmlFor="select-all"
                  className="text-sm font-medium cursor-pointer"
                >
                  Select All ({filteredDocuments.length})
                </label>
              </div>

              {/* Documents grouped by folder */}
              {Object.entries(documentsByFolder).map(([folderId, docs]) => {
                if (docs.length === 0) return null;
                const folderName =
                  folderId === 'root' ? 'Root' : folderMap[folderId] || 'Folder';

                return (
                  <div key={folderId}>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Folder className="h-3 w-3" />
                      {folderName}
                    </div>
                    <div className="space-y-1">
                      {docs.map((doc) => (
                        <div
                          key={doc.id}
                          className={cn(
                            'flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer',
                            selectedIds.has(doc.id) && 'bg-muted'
                          )}
                          onClick={() => handleToggle(doc.id)}
                        >
                          {/* Wrap checkbox to stop propagation and prevent double-toggle */}
                          <span onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(doc.id)}
                              onCheckedChange={() => handleToggle(doc.id)}
                            />
                          </span>
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{doc.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedIds.size === 0 || isLinking}
          >
            {isLinking
              ? 'Linking...'
              : `Link ${selectedIds.size} Document${selectedIds.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
