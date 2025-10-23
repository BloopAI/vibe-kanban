import { useEffect, useRef, useState, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { AutoExpandingTextarea } from '@/components/ui/auto-expanding-textarea';
import { projectsApi, tagsApi } from '@/lib/api';
import { Tag as TagIcon, FileText } from 'lucide-react';

import type { SearchResult, Tag } from 'shared/types';

interface FileSearchResult extends SearchResult {
  name: string;
}

// Unified result type for both tags and files
interface SearchResultItem {
  type: 'tag' | 'file';
  // For tags
  tag?: Tag;
  // For files
  file?: FileSearchResult;
}

interface FileSearchTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  projectId?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  maxRows?: number;
  onPasteFiles?: (files: File[]) => void;
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
}

export const FileSearchTextarea = forwardRef<
  HTMLTextAreaElement,
  FileSearchTextareaProps
>(function FileSearchTextarea(
  {
    value,
    onChange,
    placeholder,
    rows = 3,
    disabled = false,
    className,
    projectId,
    onKeyDown,
    maxRows = 10,
    onPasteFiles,
    onFocus,
    onBlur,
  },
  ref
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const [atSymbolPosition, setAtSymbolPosition] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);

  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef =
    (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search for both tags and files when query changes
  useEffect(() => {
    // No @ context, hide dropdown
    if (atSymbolPosition === -1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    // Normal case: search both tags and files with query
    const searchBoth = async () => {
      setIsLoading(true);

      try {
        const results: SearchResultItem[] = [];

        // Fetch all tags and filter client-side
        const tags = await tagsApi.list();
        const filteredTags = tags.filter((tag) =>
          tag.tag_name.toLowerCase().includes(searchQuery.toLowerCase())
        );
        results.push(
          ...filteredTags.map((tag) => ({ type: 'tag' as const, tag }))
        );

        // Fetch files (if projectId is available and query has content)
        if (projectId && searchQuery.length > 0) {
          const fileResults = await projectsApi.searchFiles(
            projectId,
            searchQuery
          );
          const fileSearchResults: FileSearchResult[] = fileResults.map(
            (item) => ({
              ...item,
              name: item.path.split('/').pop() || item.path,
            })
          );
          results.push(
            ...fileSearchResults.map((file) => ({
              type: 'file' as const,
              file,
            }))
          );
        }

        setSearchResults(results);
        setShowDropdown(results.length > 0);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Failed to search:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchBoth, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, projectId, atSymbolPosition]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onPasteFiles) return;

    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const files: File[] = [];

    if (clipboardData.files && clipboardData.files.length > 0) {
      files.push(...Array.from(clipboardData.files));
    } else if (clipboardData.items && clipboardData.items.length > 0) {
      Array.from(clipboardData.items).forEach((item) => {
        if (item.kind !== 'file') return;
        const file = item.getAsFile();
        if (file) files.push(file);
      });
    }

    const imageFiles = files.filter((file) =>
      file.type.toLowerCase().startsWith('image/')
    );

    if (imageFiles.length > 0) {
      e.preventDefault();
      onPasteFiles(imageFiles);
    }
  };

  // Handle text changes and detect @ symbol
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPosition = e.target.selectionStart || 0;

    onChange(newValue);

    // Check if @ was just typed
    const textBeforeCursor = newValue.slice(0, newCursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      // Check if there's no space after the @ (still typing the search query)
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      const hasSpace = textAfterAt.includes(' ') || textAfterAt.includes('\n');

      if (!hasSpace) {
        setAtSymbolPosition(lastAtIndex);
        setSearchQuery(textAfterAt);
        return;
      }
    }

    // If no valid @ context, hide dropdown
    setShowDropdown(false);
    setSearchQuery('');
    setAtSymbolPosition(-1);
  };

  // Select a result item (either tag or file) and insert it
  const selectResult = (result: SearchResultItem) => {
    if (atSymbolPosition === -1) return;

    const beforeAt = value.slice(0, atSymbolPosition);
    const afterQuery = value.slice(atSymbolPosition + 1 + searchQuery.length);

    let insertText = '';
    let newCursorPos = atSymbolPosition;

    if (result.type === 'tag' && result.tag) {
      // Insert tag content
      insertText = result.tag.content || '';
      newCursorPos = atSymbolPosition + insertText.length;
    } else if (result.type === 'file' && result.file) {
      // Insert file path (keep @ for files)
      insertText = result.file.path;
      newCursorPos = atSymbolPosition + insertText.length;
    }

    const newValue = beforeAt + insertText + afterQuery;
    onChange(newValue);
    setShowDropdown(false);
    setSearchQuery('');
    setAtSymbolPosition(-1);

    // Focus back to textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Calculate dropdown position relative to textarea
  const getDropdownPosition = () => {
    if (!textareaRef.current) return { top: 0, left: 0, maxHeight: 240 };

    const textareaRect = textareaRef.current.getBoundingClientRect();
    const dropdownWidth = 320; // Wider for tag content preview
    const maxDropdownHeight = 320;
    const minDropdownHeight = 120;

    // Position dropdown below the textarea by default
    let finalTop = textareaRect.bottom + 4; // 4px gap
    let finalLeft = textareaRect.left;
    let maxHeight = maxDropdownHeight;

    // Ensure dropdown doesn't go off the right edge
    if (finalLeft + dropdownWidth > window.innerWidth - 16) {
      finalLeft = window.innerWidth - dropdownWidth - 16;
    }

    // Ensure dropdown doesn't go off the left edge
    if (finalLeft < 16) {
      finalLeft = 16;
    }

    // Calculate available space below and above textarea
    const availableSpaceBelow = window.innerHeight - textareaRect.bottom - 32;
    const availableSpaceAbove = textareaRect.top - 32;

    // If not enough space below, position above
    if (
      availableSpaceBelow < minDropdownHeight &&
      availableSpaceAbove > availableSpaceBelow
    ) {
      // Get actual height from rendered dropdown
      const actualHeight =
        dropdownRef.current?.getBoundingClientRect().height ||
        minDropdownHeight;
      finalTop = textareaRect.top - actualHeight - 4;
      maxHeight = Math.min(
        maxDropdownHeight,
        Math.max(availableSpaceAbove, minDropdownHeight)
      );
    } else {
      // Position below with available space
      maxHeight = Math.min(
        maxDropdownHeight,
        Math.max(availableSpaceBelow, minDropdownHeight)
      );
    }

    return { top: finalTop, left: finalLeft, maxHeight };
  };

  // Use effect to reposition when dropdown content changes
  useEffect(() => {
    if (showDropdown && dropdownRef.current) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        const newPosition = getDropdownPosition();
        if (dropdownRef.current) {
          dropdownRef.current.style.top = `${newPosition.top}px`;
          dropdownRef.current.style.left = `${newPosition.left}px`;
          dropdownRef.current.style.maxHeight = `${newPosition.maxHeight}px`;
        }
      }, 0);
    }
  }, [searchResults.length, showDropdown]);

  const dropdownPosition = getDropdownPosition();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle dropdown navigation first
    if (showDropdown && searchResults.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < searchResults.length - 1 ? prev + 1 : 0
          );
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : searchResults.length - 1
          );
          return;
        case 'Enter':
          if (selectedIndex >= 0) {
            e.preventDefault();
            selectResult(searchResults[selectedIndex]);
            return;
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowDropdown(false);
          setSearchQuery('');
          setAtSymbolPosition(-1);
          return;
      }
    } else {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          textareaRef.current?.blur();
          break;
      }
    }

    // Propagate event to parent component for additional handling
    onKeyDown?.(e);
  };

  // Group results by type for rendering
  const tagResults = searchResults.filter((r) => r.type === 'tag');
  const fileResults = searchResults.filter((r) => r.type === 'file');

  return (
    <div
      className={`relative ${className?.includes('flex-1') ? 'flex-1' : ''}`}
    >
      <AutoExpandingTextarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={className}
        maxRows={maxRows}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={onFocus}
        onBlur={onBlur}
      />

      {showDropdown &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed bg-background border border-border rounded-md shadow-lg overflow-y-auto"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              maxHeight: dropdownPosition.maxHeight,
              minWidth: '320px',
              zIndex: 10000, // Higher than dialog z-[9999]
            }}
          >
            {isLoading ? (
              <div className="p-2 text-sm text-muted-foreground">
                Searching...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">
                No tags or files found
              </div>
            ) : (
              <div className="py-1">
                {/* Tags Section */}
                {tagResults.length > 0 && (
                  <>
                    <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">
                      Tags
                    </div>
                    {tagResults.map((result) => {
                      const index = searchResults.indexOf(result);
                      const tag = result.tag!;
                      return (
                        <div
                          key={`tag-${tag.id}`}
                          className={`px-3 py-2 cursor-pointer text-sm ${
                            index === selectedIndex
                              ? 'bg-muted text-foreground'
                              : 'hover:bg-muted'
                          }`}
                          onClick={() => selectResult(result)}
                          aria-selected={index === selectedIndex}
                          role="option"
                        >
                          <div className="flex items-center gap-2 font-medium">
                            <TagIcon className="h-3.5 w-3.5 text-blue-600" />
                            <span>@{tag.tag_name}</span>
                          </div>
                          {tag.content && (
                            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                              {tag.content.slice(0, 60)}
                              {tag.content.length > 60 ? '...' : ''}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* Files Section */}
                {fileResults.length > 0 && (
                  <>
                    {tagResults.length > 0 && <div className="border-t my-1" />}
                    <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">
                      Files
                    </div>
                    {fileResults.map((result) => {
                      const index = searchResults.indexOf(result);
                      const file = result.file!;
                      return (
                        <div
                          key={`file-${file.path}`}
                          className={`px-3 py-2 cursor-pointer text-sm ${
                            index === selectedIndex
                              ? 'bg-muted text-foreground'
                              : 'hover:bg-muted'
                          }`}
                          onClick={() => selectResult(result)}
                          aria-selected={index === selectedIndex}
                          role="option"
                        >
                          <div className="flex items-center gap-2 font-medium truncate">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span>{file.name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {file.path}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
});
