import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle,
  Plus,
  Folder,
  FileText,
  FolderPlus,
  ChevronRight,
  Search,
  MoreHorizontal,
  Pin,
  Trash2,
  Edit,
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Wand2,
} from 'lucide-react';
import { DocumentOutline } from '@/components/documents/DocumentOutline';
import { Loader } from '@/components/ui/loader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useDocuments } from '@/hooks/useDocuments';
import { useTeams } from '@/hooks/useTeams';

import type { Document, DocumentFolder } from 'shared/types';

// File type icons
const FILE_TYPE_ICONS: Record<string, string> = {
  markdown: 'md',
  pdf: 'pdf',
  txt: 'txt',
  csv: 'csv',
  xlsx: 'xlsx',
};

export function TeamDocuments() {
  const { t } = useTranslation(['common']);
  const { teamId } = useParams<{ teamId: string }>();

  const { teamsById, isLoading: teamsLoading } = useTeams();
  const team = teamId ? teamsById[teamId] : null;

  const {
    documents,
    folders,
    isLoading,
    error,
    currentFolderId,
    setCurrentFolderId,
    createDocument,
    updateDocument,
    deleteDocument,
    createFolder,
    deleteFolder,
  } = useDocuments(teamId || '');

  // Dialog states
  const [isCreateDocOpen, setIsCreateDocOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOutline, setShowOutline] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Form states
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  // Build breadcrumb path
  const breadcrumbs = useMemo(() => {
    const path: DocumentFolder[] = [];
    if (!currentFolderId) return path;

    let folderId: string | null = currentFolderId;
    while (folderId) {
      const folder = folders.find((f) => f.id === folderId);
      if (folder) {
        path.unshift(folder);
        folderId = folder.parent_id;
      } else {
        break;
      }
    }
    return path;
  }, [folders, currentFolderId]);

  // Filter folders and documents for current view
  const currentFolders = useMemo(() => {
    return folders.filter((f) => f.parent_id === currentFolderId);
  }, [folders, currentFolderId]);

  const currentDocuments = useMemo(() => {
    if (searchQuery) {
      return documents.filter((d) =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return documents.filter((d) => d.folder_id === currentFolderId);
  }, [documents, currentFolderId, searchQuery]);

  // Handlers
  const handleCreateDocument = useCallback(async () => {
    if (!newDocTitle.trim()) return;

    try {
      await createDocument({
        title: newDocTitle,
        content: newDocContent || null,
        folder_id: currentFolderId,
        file_type: 'markdown',
        icon: null,
      });
      setIsCreateDocOpen(false);
      setNewDocTitle('');
      setNewDocContent('');
    } catch (err) {
      console.error('Failed to create document:', err);
    }
  }, [newDocTitle, newDocContent, currentFolderId, createDocument]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;

    try {
      await createFolder({
        name: newFolderName,
        parent_id: currentFolderId,
        icon: null,
        color: null,
      });
      setIsCreateFolderOpen(false);
      setNewFolderName('');
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }, [newFolderName, currentFolderId, createFolder]);

  const handleDeleteDocument = useCallback(
    async (docId: string) => {
      try {
        await deleteDocument(docId);
      } catch (err) {
        console.error('Failed to delete document:', err);
      }
    },
    [deleteDocument]
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      try {
        await deleteFolder(folderId);
      } catch (err) {
        console.error('Failed to delete folder:', err);
      }
    },
    [deleteFolder]
  );

  const handleTogglePin = useCallback(
    async (doc: Document) => {
      try {
        await updateDocument(doc.id, {
          folder_id: doc.folder_id,
          title: doc.title,
          content: doc.content,
          icon: doc.icon,
          is_pinned: !doc.is_pinned,
          is_archived: doc.is_archived,
          position: doc.position,
        });
      } catch (err) {
        console.error('Failed to toggle pin:', err);
      }
    },
    [updateDocument]
  );

  const handleNavigateToFolder = useCallback(
    (folderId: string | null) => {
      setCurrentFolderId(folderId);
      setSearchQuery('');
    },
    [setCurrentFolderId]
  );

  const handleOpenDocument = useCallback((doc: Document) => {
    setEditingDoc(doc);
  }, []);

  const handleSaveDocument = useCallback(async () => {
    if (!editingDoc) return;

    try {
      const updated = await updateDocument(editingDoc.id, {
        folder_id: editingDoc.folder_id,
        title: editingDoc.title,
        content: editingDoc.content,
        icon: editingDoc.icon,
        is_pinned: editingDoc.is_pinned,
        is_archived: editingDoc.is_archived,
        position: editingDoc.position,
      });
      // Update local state with saved document but stay on same page
      if (updated) {
        setEditingDoc(updated);
      }
    } catch (err) {
      console.error('Failed to save document:', err);
    }
  }, [editingDoc, updateDocument]);

  // Format document content as proper markdown
  const handleFormatDocument = useCallback(() => {
    if (!editingDoc?.content) return;

    let content = editingDoc.content;

    // Normalize line endings
    content = content.replace(/\r\n/g, '\n');

    // Split into lines for processing
    const lines = content.split('\n');
    const formattedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trimEnd();
      const nextLine = lines[i + 1]?.trim() || '';
      const prevLine = formattedLines[formattedLines.length - 1]?.trim() || '';

      // Skip if already a markdown heading
      if (line.match(/^#{1,6}\s/)) {
        formattedLines.push(line);
        continue;
      }

      // Detect potential headings:
      // - Short line (< 80 chars) that's not empty
      // - Ends with ? or is title-like (starts with capital, no ending punctuation except ?)
      // - Followed by blank line or longer paragraph
      // - Previous line is blank or doesn't exist
      const isShortLine = line.length > 0 && line.length < 80;
      const looksLikeHeading =
        line.match(/^[A-Z]/) && // Starts with capital
        !line.match(/[.!,;:]$/) && // Doesn't end with sentence punctuation
        !line.match(/^[-*]\s/); // Not a list item
      const followedByParagraph =
        nextLine === '' || (nextLine.length > line.length && !nextLine.match(/^[-*#]/));
      const afterBlankOrStart = prevLine === '' || formattedLines.length === 0;

      if (isShortLine && looksLikeHeading && followedByParagraph && afterBlankOrStart) {
        // Convert to heading - use ## for most, # for very short/title-like
        const headingLevel = line.length < 30 && i === 0 ? '#' : '##';
        formattedLines.push(`${headingLevel} ${line}`);
      } else {
        formattedLines.push(line);
      }
    }

    content = formattedLines.join('\n');

    // Ensure blank line before headings (except at start)
    content = content.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');

    // Ensure blank line after headings
    content = content.replace(/(#{1,6}\s[^\n]+)\n([^#\n])/g, '$1\n\n$2');

    // Ensure proper list formatting (space after - or *)
    content = content.replace(/^(\s*[-*])([^\s])/gm, '$1 $2');

    // Normalize multiple blank lines to double
    content = content.replace(/\n{3,}/g, '\n\n');

    // Trim trailing whitespace from each line
    content = content
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');

    // Trim start and end
    content = content.trim();

    // Ensure file ends with single newline
    content = content + '\n';

    setEditingDoc({ ...editingDoc, content });
  }, [editingDoc]);

  // Scroll to a specific line in the textarea
  const handleHeadingClick = useCallback((line: number) => {
    if (!textareaRef.current || !editingDoc?.content) return;

    const lines = editingDoc.content.split('\n');
    let charIndex = 0;

    // Calculate character position of the target line
    for (let i = 0; i < line - 1 && i < lines.length; i++) {
      charIndex += lines[i].length + 1; // +1 for newline
    }

    // Focus and scroll to position
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(charIndex, charIndex);

    // Calculate approximate scroll position
    const lineHeight = 20; // approximate line height in pixels
    const scrollTop = (line - 1) * lineHeight;
    textareaRef.current.scrollTop = Math.max(0, scrollTop - 100);
  }, [editingDoc?.content]);

  // Loading state
  if (error) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            {t('states.error')}
          </AlertTitle>
          <AlertDescription>
            {error.message || 'Failed to load documents'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading || teamsLoading) {
    return <Loader message="Loading documents..." size={32} className="py-8" />;
  }

  if (!team) {
    return (
      <div className="p-4">
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle size="16" />
            Team not found
          </AlertTitle>
          <AlertDescription>
            The team you're looking for doesn't exist.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Document editor view
  if (editingDoc) {
    return (
      <div className="h-full flex flex-col">
        {/* Editor Header */}
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingDoc(null)}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Input
                value={editingDoc.title}
                onChange={(e) =>
                  setEditingDoc({ ...editingDoc, title: e.target.value })
                }
                className="text-lg font-semibold border-none shadow-none focus-visible:ring-0 px-0"
                placeholder="Document title"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOutline(!showOutline)}
                title={showOutline ? 'Hide outline' : 'Show outline'}
              >
                {showOutline ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFormatDocument}
                title="Format document"
              >
                <Wand2 className="h-4 w-4 mr-1" />
                Format
              </Button>
              <Button size="sm" onClick={handleSaveDocument}>
                Save
              </Button>
            </div>
          </div>
        </div>

        {/* Editor Content with Outline Sidebar */}
        <div className="flex-1 min-h-0 flex">
          {/* Outline Sidebar (Left) */}
          {showOutline && (
            <div className="w-64 shrink-0 border-r bg-muted/30 overflow-auto">
              <DocumentOutline
                content={editingDoc.content || ''}
                onHeadingClick={handleHeadingClick}
              />
            </div>
          )}

          {/* Main Editor */}
          <div className="flex-1 min-w-0 p-4">
            <Textarea
              ref={textareaRef}
              value={editingDoc.content || ''}
              onChange={(e) =>
                setEditingDoc({ ...editingDoc, content: e.target.value })
              }
              className="w-full h-full resize-none font-mono text-sm"
              placeholder="Start writing your document in Markdown..."
            />
          </div>
        </div>
      </div>
    );
  }

  const hasContent = currentFolders.length > 0 || currentDocuments.length > 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{team.icon || '👥'}</span>
            <h1 className="text-lg font-semibold">{team.name}</h1>
            <span className="text-muted-foreground">/ Documents</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateFolderOpen(true)}
            >
              <FolderPlus className="h-4 w-4 mr-1" />
              New Folder
            </Button>
            <Button size="sm" onClick={() => setIsCreateDocOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Document
            </Button>
          </div>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground">
          <button
            onClick={() => handleNavigateToFolder(null)}
            className="hover:text-foreground"
          >
            Documents
          </button>
          {breadcrumbs.map((folder) => (
            <div key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4" />
              <button
                onClick={() => handleNavigateToFolder(folder.id)}
                className="hover:text-foreground"
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {!hasContent && !searchQuery ? (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No documents yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first document or folder to get started
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateFolderOpen(true)}
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Create Folder
                </Button>
                <Button onClick={() => setIsCreateDocOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Document
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {/* Folders */}
            {currentFolders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer group"
                onClick={() => handleNavigateToFolder(folder.id)}
              >
                <div className="flex items-center gap-3">
                  <Folder className="h-5 w-5 text-blue-500" />
                  <span className="font-medium">{folder.name}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFolder(folder.id);
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}

            {/* Documents */}
            {currentDocuments.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer group"
                onClick={() => handleOpenDocument(doc)}
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-gray-500" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{doc.title}</span>
                      {doc.is_pinned && (
                        <Pin className="h-3 w-3 text-amber-500" />
                      )}
                      <span className="text-xs text-muted-foreground uppercase">
                        {FILE_TYPE_ICONS[doc.file_type] || doc.file_type}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Updated{' '}
                      {new Date(doc.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDocument(doc);
                      }}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePin(doc);
                      }}
                    >
                      <Pin className="h-4 w-4 mr-2" />
                      {doc.is_pinned ? 'Unpin' : 'Pin'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDocument(doc.id);
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}

            {searchQuery && currentDocuments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No documents found matching "{searchQuery}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Document Dialog */}
      <Dialog open={isCreateDocOpen} onOpenChange={setIsCreateDocOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Document</DialogTitle>
            <DialogDescription>
              Create a new markdown document in this folder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="Document title"
              />
            </div>
            <div>
              <Label htmlFor="doc-content">Content (optional)</Label>
              <Textarea
                id="doc-content"
                value={newDocContent}
                onChange={(e) => setNewDocContent(e.target.value)}
                placeholder="Start writing..."
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDocOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDocument} disabled={!newDocTitle.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Folder Dialog */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Create a new folder to organize your documents.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateFolderOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
