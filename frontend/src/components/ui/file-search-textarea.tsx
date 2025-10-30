import { useEffect, useRef, useState, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { AutoExpandingTextarea } from '@/components/ui/auto-expanding-textarea';
import { projectsApi, tagsApi } from '@/lib/api';
import { Tag as TagIcon, FileText } from 'lucide-react';

import type { SearchResult, Tag, SlashCommand } from 'shared/types';

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

  // --- SLASH COMMAND STATE ---
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [showSlashDropdown, setShowSlashDropdown] = useState(false);
  const [slashSearchQuery, setSlashSearchQuery] = useState('');
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [slashPosition, setSlashPosition] = useState(-1);
  const [isLoadingCommands, setIsLoadingCommands] = useState(false);

  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef =
    (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;
  const dropdownRef = useRef<HTMLDivElement>(null);
const slashDropdownRef = useRef<HTMLDivElement>(null);

  // --- SLASH COMMAND LOGIC ---

  // Load commands on mount
  useEffect(() => {
    loadSlashCommands();
  }, []);

  const loadSlashCommands = async () => {
    setIsLoadingCommands(true);
    try {
      const response = await fetch('/api/filesystem/slash-commands');
      const result = await response.json();
      if (result.success) {
        setCommands(result.data || []);
      }
    } catch (error) {
      console.error('Failed to load slash commands:', error);
    } finally {
      setIsLoadingCommands(false);
    }
  };

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

  // Handle text changes and detect @ symbol and / symbol
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPosition = e.target.selectionStart || 0;

    onChange(newValue);

    // Check for slash command trigger first
    const textBeforeCursor = newValue.slice(0, newCursorPosition);
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/');

    if (lastSlashIndex !== -1) {
      // Check if it's at start of line or after space/newline
      const startOfLineCheck = textBeforeCursor.slice(0, lastSlashIndex);
      const isValidSlashPosition = startOfLineCheck.trimEnd().endsWith('\n') ||
                                 startOfLineCheck.trimEnd() === '' ||
                                 startOfLineCheck.endsWith(' ');

      if (isValidSlashPosition) {
        const textAfterSlash = textBeforeCursor.slice(lastSlashIndex + 1);
        const hasInvalidChars = textAfterSlash.includes(' ') || textAfterSlash.includes('\n');

        if (!hasInvalidChars && textAfterSlash.length < 20) { // Reasonable limit
          setSlashPosition(lastSlashIndex);
          setSlashSearchQuery(textAfterSlash);
          setShowSlashDropdown(true);
          setSelectedSlashIndex(0);
          // Hide file search dropdown when slash is active
          setShowDropdown(false);
          setAtSymbolPosition(-1);
          setSearchQuery('');
          return;
        }
      }
    }

    // Reset slash command state
    setShowSlashDropdown(false);
    setSlashSearchQuery('');
    setSlashPosition(-1);
    setSelectedSlashIndex(0);

    // Check if @ was just typed
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

  // Slash command selection
  const selectSlashCommand = (command: SlashCommand) => {
    if (slashPosition === -1) return;

    const beforeSlash = value.slice(0, slashPosition);
    const afterSlashQuery = value.slice(slashPosition + 1 + slashSearchQuery.length);

    const newValue = beforeSlash + command.name + afterSlashQuery;
    onChange(newValue);

    // Reset slash command state
    setShowSlashDropdown(false);
    setSlashSearchQuery('');
    setSlashPosition(-1);
    setSelectedSlashIndex(0);

    // Focus back to textarea and position cursor after command
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPosition = slashPosition + command.name.length;
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
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
    const maxDropdownHeight = Math.min(240, window.innerHeight * 0.4); // Max 240px or 40% of viewport height
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

  // Filter slash commands based on search query
  const filteredSlashCommands = commands.filter(cmd => {
    const query = slashSearchQuery.toLowerCase();
    const nameWithoutSlash = cmd.name.substring(1).toLowerCase(); // Remove leading "/" for comparison

    // For slash commands, ONLY use prefix matching on command name (after removing "/")
    // No description or example matching for slash commands - this is for command discovery, not content search
    return nameWithoutSlash.startsWith(query);
  }).slice(0, 50); // Limit to max 50 items to prevent extremely long dropdowns

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle slash command navigation first
    if (showSlashDropdown && filteredSlashCommands.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedSlashIndex(prev => (prev + 1) % filteredSlashCommands.length);
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedSlashIndex(prev => prev === 0 ? filteredSlashCommands.length - 1 : prev - 1);
          return;
        case 'Enter':
          e.preventDefault();
          if (filteredSlashCommands.length > 0) {
            selectSlashCommand(filteredSlashCommands[selectedSlashIndex]);
          }
          return;
        case 'Escape':
          e.preventDefault();
          setShowSlashDropdown(false);
          setSelectedSlashIndex(0);
          return;
      }
    }

    // Handle dropdown navigation second
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

  // Click outside to close slash dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close dropdown if clicking outside both textarea and both dropdowns
      const clickedInsideTextarea = textareaRef.current?.contains(event.target as Node);
      const clickedInsideFileDropdown = dropdownRef.current?.contains(event.target as Node);
      const clickedInsideSlashDropdown = slashDropdownRef.current?.contains(event.target as Node);

      if (!clickedInsideTextarea && !clickedInsideFileDropdown && !clickedInsideSlashDropdown) {
        setShowSlashDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

      {/* SLASH COMMAND DROPDOWN */}
      {showSlashDropdown && !disabled &&
        createPortal(
          <div
            ref={slashDropdownRef}
            className="fixed bg-background border border-border rounded-md shadow-lg overflow-y-auto z-50"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              maxHeight: dropdownPosition.maxHeight,
              minWidth: '320px',
            }}
          >
            {isLoadingCommands ? (
              <div className="p-4 text-sm text-muted-foreground flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Loading commands...
              </div>
            ) : filteredSlashCommands.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                {slashSearchQuery.trim() ? `No commands found for "${slashSearchQuery}"` : 'No commands available'}
              </div>
            ) : (
              <div role="listbox" className="py-1">
                {filteredSlashCommands.map((command, index) => (
                  <div
                    key={command.id}
                    className={`
                      px-3 py-2 cursor-pointer text-sm hover:bg-accent hover:text-accent-foreground
                      ${index === selectedSlashIndex ? 'bg-accent text-accent-foreground' : ''}
                    `}
                    onClick={() => selectSlashCommand(command)}
                    role="option"
                    aria-selected={index === selectedSlashIndex}
                  >
                    <div className="font-medium text-foreground">
                      {command.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {command.category === 'global' ? '🌐' : '📁'}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-xs mt-0.5 line-clamp-2">
                      {command.description}
                    </div>
                    {command.examples && command.examples.length > 0 && (
                      <div className="text-xs font-mono bg-muted/50 px-2 py-1 rounded mt-1">
                        {command.examples[0]}
                      </div>
                    )}
                  </div>
                ))}
                {commands.filter(cmd => {
                  const query = slashSearchQuery.toLowerCase();
                  const nameWithoutSlash = cmd.name.substring(1).toLowerCase();
                  return nameWithoutSlash.startsWith(query);
                }).length > 50 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                    More commands available, keep typing to narrow down...
                  </div>
                )}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
});
