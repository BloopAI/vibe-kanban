import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AutoExpandingTextarea } from '@/components/ui/auto-expanding-textarea';
import { projectsApi } from '@/lib/api';

import type { SearchResult } from 'shared/types';

interface FileSearchResult extends SearchResult {
  name: string;
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
  onCommandEnter?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onCommandShiftEnter?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function FileSearchTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled = false,
  className,
  projectId,
  onCommandEnter,
  onCommandShiftEnter,
  maxRows = 10,
}: FileSearchTextareaProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const [atSymbolPosition, setAtSymbolPosition] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search for files when query changes
  useEffect(() => {
    if (!searchQuery || !projectId || searchQuery.length < 1) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const searchFiles = async () => {
      setIsLoading(true);

      try {
        const result = await projectsApi.searchFiles(projectId, searchQuery);
        // Transform SearchResult to FileSearchResult by adding name field
        const fileResults: FileSearchResult[] = result.map((item) => ({
          ...item,
          name: item.path.split('/').pop() || item.path,
        }));
        setSearchResults(fileResults);
        setShowDropdown(true);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Failed to search files:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchFiles, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, projectId]);

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

  // Handle keyboard navigation

  // Select a file and insert it into the text
  const selectFile = (file: FileSearchResult) => {
    if (atSymbolPosition === -1) return;

    const beforeAt = value.slice(0, atSymbolPosition);
    const afterQuery = value.slice(atSymbolPosition + 1 + searchQuery.length);
    const newValue = beforeAt + file.path + afterQuery;

    onChange(newValue);
    setShowDropdown(false);
    setSearchQuery('');
    setAtSymbolPosition(-1);

    // Focus back to textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = atSymbolPosition + file.path.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Calculate dropdown position relative to textarea (simpler, more stable approach)
  const getDropdownPosition = () => {
    if (!textareaRef.current) return { top: 0, left: 0, maxHeight: 240 };

    const textareaRect = textareaRef.current.getBoundingClientRect();
    const dropdownWidth = 256; // min-w-64 = 256px
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
            selectFile(searchResults[selectedIndex]);
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
  };

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
        onCommandEnter={onCommandEnter}
        onCommandShiftEnter={onCommandShiftEnter}
      />

      {showDropdown &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed bg-background border border-border rounded-md shadow-lg overflow-y-auto min-w-64"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              maxHeight: dropdownPosition.maxHeight,
              zIndex: 10000, // Higher than dialog z-[9999]
            }}
          >
            {isLoading ? (
              <div className="p-2 text-sm text-muted-foreground">
                Searching...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">
                No files found
              </div>
            ) : (
              <div className="py-1">
                {searchResults.map((file, index) => (
                  <div
                    key={file.path}
                    className={`px-3 py-2 cursor-pointer text-sm ${
                      index === selectedIndex
                        ? 'bg-muted text-foreground'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => selectFile(file)}
                    aria-selected={index === selectedIndex}
                    role="option"
                  >
                    <div className="font-medium truncate">{file.name}</div>
                    <div
                      className={`text-xs truncate ${
                        index === selectedIndex
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {file.path}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
