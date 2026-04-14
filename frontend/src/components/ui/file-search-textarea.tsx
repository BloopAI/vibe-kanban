import {
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useLayoutEffect,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { AutoExpandingTextarea } from '@/components/ui/auto-expanding-textarea';
import { projectsApi, templatesApi, configApi } from '@/lib/api';
import type { SlashCommandItem } from '@/lib/api/config';
import { Tag as TagIcon, FileText, TerminalSquare } from 'lucide-react';
import { getCaretClientRect } from '@/lib/caretPosition';

import type { SearchResult, Template } from 'shared/types';

const DROPDOWN_MIN_WIDTH = 320;
const DROPDOWN_MAX_HEIGHT = 320;
const DROPDOWN_MIN_HEIGHT = 120;
const DROPDOWN_VIEWPORT_PADDING = 16;
const DROPDOWN_VIEWPORT_PADDING_TOTAL = DROPDOWN_VIEWPORT_PADDING * 2;
const DROPDOWN_GAP = 4;

interface FileSearchResult extends SearchResult {
  name: string;
}

// Unified result type for both templates and files
interface SearchResultItem {
  type: 'template' | 'file';
  // For templates
  template?: Template;
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
  onPasteFiles?: (files: File[], cursorPosition: number) => void;
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  onSelectionChange?: (cursorPosition: number) => void;
  disableScroll?: boolean;
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
    onSelectionChange,
    disableScroll = false,
  },
  ref
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const [atSymbolPosition, setAtSymbolPosition] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);

  // Slash command state
  const [slashPosition, setSlashPosition] = useState(-1);
  const [slashQuery, setSlashQuery] = useState('');
  const [allSlashCommands, setAllSlashCommands] = useState<SlashCommandItem[]>([]);
  const [slashCommandsLoaded, setSlashCommandsLoaded] = useState(false);
  const [slashLoading, setSlashLoading] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(-1);

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

    // Normal case: search both templates and files with query
    const searchBoth = async () => {
      setIsLoading(true);

      try {
        const results: SearchResultItem[] = [];

        // Fetch all templates and filter client-side
        const templates = await templatesApi.list();
        const filteredTemplates = templates.filter((template) =>
          template.template_name
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
        );
        results.push(
          ...filteredTemplates.map((template) => ({
            type: 'template' as const,
            template,
          }))
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

  // Fetch slash commands once when slash mode first activates
  useEffect(() => {
    if (slashPosition === -1 || slashCommandsLoaded || slashLoading) return;
    setSlashLoading(true);
    configApi
      .getSlashCommands(projectId)
      .then((result) => {
        const items: SlashCommandItem[] = [
          ...result.commands,
          ...result.agents.map((a) => ({
            name: a.id,
            description: a.label !== a.id ? a.label : a.description ?? null,
          })),
        ];
        setAllSlashCommands(items);
        setSlashCommandsLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to fetch slash commands:', err);
      })
      .finally(() => {
        setSlashLoading(false);
      });
  }, [slashPosition, slashCommandsLoaded, slashLoading, projectId]);

  const slashResults = useMemo(() => {
    if (slashPosition === -1) return [];
    if (!slashQuery) return allSlashCommands.slice(0, 20);
    const q = slashQuery.toLowerCase();
    return allSlashCommands
      .filter(
        (cmd) =>
          cmd.name.toLowerCase().startsWith(q) ||
          cmd.name.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [slashPosition, slashQuery, allSlashCommands]);

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
      // Capture cursor position at paste time
      const cursorPosition = e.currentTarget.selectionStart ?? value.length;
      onPasteFiles(imageFiles, cursorPosition);
    }
  };

  // Handle text changes and detect @ and / symbols
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPosition = e.target.selectionStart || 0;

    onChange(newValue);

    const textBeforeCursor = newValue.slice(0, newCursorPosition);

    // Check for / trigger: only at position 0 or immediately after whitespace
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      const charBefore =
        lastSlashIndex > 0 ? textBeforeCursor[lastSlashIndex - 1] : '';
      const isValidTrigger =
        lastSlashIndex === 0 || charBefore === ' ' || charBefore === '\n';
      const textAfterSlash = textBeforeCursor.slice(lastSlashIndex + 1);
      const hasSpace =
        textAfterSlash.includes(' ') || textAfterSlash.includes('\n');

      if (isValidTrigger && !hasSpace) {
        setSlashPosition(lastSlashIndex);
        setSlashQuery(textAfterSlash);
        setSlashSelectedIndex(-1);
        // Clear @ mode
        setShowDropdown(false);
        setAtSymbolPosition(-1);
        setSearchQuery('');
        return;
      }
    }

    // Clear slash mode if no longer valid
    if (slashPosition !== -1) {
      setSlashPosition(-1);
      setSlashQuery('');
      setSlashSelectedIndex(-1);
    }

    // Check if @ was just typed
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtIndex !== -1) {
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

  // Select a result item (either template or file) and insert it
  const selectResult = (result: SearchResultItem) => {
    if (atSymbolPosition === -1) return;

    const beforeAt = value.slice(0, atSymbolPosition);
    const afterQuery = value.slice(atSymbolPosition + 1 + searchQuery.length);

    let insertText = '';
    let newCursorPos = atSymbolPosition;

    if (result.type === 'template' && result.template) {
      // Insert template content
      insertText = result.template.content || '';
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

  const selectSlashCommand = (cmd: SlashCommandItem) => {
    if (slashPosition === -1) return;
    const beforeSlash = value.slice(0, slashPosition);
    const afterQuery = value.slice(slashPosition + 1 + slashQuery.length);
    const insertText = `/${cmd.name} `;
    const newValue = beforeSlash + insertText + afterQuery;
    const newCursorPos = slashPosition + insertText.length;
    onChange(newValue);
    setSlashPosition(-1);
    setSlashQuery('');
    setSlashSelectedIndex(-1);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Calculate dropdown position relative to textarea
  const getDropdownPosition = useCallback(() => {
    if (typeof window === 'undefined' || !textareaRef.current) {
      return {
        top: 0,
        left: 0,
        maxHeight: DROPDOWN_MAX_HEIGHT,
      };
    }

    const caretRect = getCaretClientRect(textareaRef.current);
    const referenceRect =
      caretRect ?? textareaRef.current.getBoundingClientRect();
    const currentDropdownRect = dropdownRef.current?.getBoundingClientRect();

    const availableWidth = Math.max(
      window.innerWidth - DROPDOWN_VIEWPORT_PADDING * 2,
      0
    );
    const fallbackWidth =
      availableWidth > 0
        ? Math.min(DROPDOWN_MIN_WIDTH, availableWidth)
        : DROPDOWN_MIN_WIDTH;
    const measuredWidth =
      currentDropdownRect && currentDropdownRect.width > 0
        ? currentDropdownRect.width
        : fallbackWidth;
    const dropdownWidth =
      availableWidth > 0
        ? Math.min(Math.max(measuredWidth, fallbackWidth), availableWidth)
        : Math.max(measuredWidth, fallbackWidth);

    // Position dropdown near the caret by default
    let finalTop = referenceRect.bottom + DROPDOWN_GAP;
    let finalLeft = referenceRect.left;
    let maxHeight = DROPDOWN_MAX_HEIGHT;

    // Ensure dropdown doesn't go off the right edge
    if (
      finalLeft + dropdownWidth >
      window.innerWidth - DROPDOWN_VIEWPORT_PADDING
    ) {
      finalLeft = window.innerWidth - dropdownWidth - DROPDOWN_VIEWPORT_PADDING;
    }

    // Ensure dropdown doesn't go off the left edge
    if (finalLeft < DROPDOWN_VIEWPORT_PADDING) {
      finalLeft = DROPDOWN_VIEWPORT_PADDING;
    }

    // Calculate available space below and above the caret
    const availableSpaceBelow =
      window.innerHeight - referenceRect.bottom - DROPDOWN_VIEWPORT_PADDING * 2;
    const availableSpaceAbove =
      referenceRect.top - DROPDOWN_VIEWPORT_PADDING * 2;

    // If not enough space below, position above
    if (
      availableSpaceBelow < DROPDOWN_MIN_HEIGHT &&
      availableSpaceAbove > availableSpaceBelow
    ) {
      const actualHeight = currentDropdownRect?.height || DROPDOWN_MIN_HEIGHT;
      finalTop = referenceRect.top - actualHeight - DROPDOWN_GAP;
      maxHeight = Math.min(
        DROPDOWN_MAX_HEIGHT,
        Math.max(availableSpaceAbove, DROPDOWN_MIN_HEIGHT)
      );
    } else {
      // Position below with available space
      maxHeight = Math.min(
        DROPDOWN_MAX_HEIGHT,
        Math.max(availableSpaceBelow, DROPDOWN_MIN_HEIGHT)
      );
    }

    const estimatedHeight =
      currentDropdownRect?.height || Math.min(maxHeight, DROPDOWN_MAX_HEIGHT);
    const maxTop =
      window.innerHeight -
      DROPDOWN_VIEWPORT_PADDING -
      Math.max(estimatedHeight, DROPDOWN_MIN_HEIGHT);

    if (finalTop > maxTop) {
      finalTop = Math.max(DROPDOWN_VIEWPORT_PADDING, maxTop);
    }

    if (finalTop < DROPDOWN_VIEWPORT_PADDING) {
      finalTop = DROPDOWN_VIEWPORT_PADDING;
    }

    return {
      top: finalTop,
      left: finalLeft,
      maxHeight,
    };
  }, [textareaRef]);

  const [dropdownPosition, setDropdownPosition] = useState(() =>
    getDropdownPosition()
  );

  // Keep dropdown positioned near the caret and within viewport bounds
  const showSlashDropdown = slashPosition !== -1 && slashResults.length > 0;
  useLayoutEffect(() => {
    if (!showDropdown && !showSlashDropdown) return;

    const updatePosition = () => {
      const newPosition = getDropdownPosition();
      setDropdownPosition((prev) => {
        if (
          prev.top === newPosition.top &&
          prev.left === newPosition.left &&
          prev.maxHeight === newPosition.maxHeight
        ) {
          return prev;
        }
        return newPosition;
      });
    };

    updatePosition();
    let frameId = requestAnimationFrame(updatePosition);

    const scheduleUpdate = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updatePosition);
    };

    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, [showDropdown, showSlashDropdown, searchResults.length, slashResults.length, getDropdownPosition]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle slash command dropdown navigation
    if (showSlashDropdown) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSlashSelectedIndex((prev) =>
            prev < slashResults.length - 1 ? prev + 1 : 0
          );
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSlashSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : slashResults.length - 1
          );
          return;
        case 'Enter':
        case 'Tab': {
          const idx = slashSelectedIndex >= 0 ? slashSelectedIndex : 0;
          if (slashResults[idx]) {
            e.preventDefault();
            e.stopPropagation();
            selectSlashCommand(slashResults[idx]);
            return;
          }
          break;
        }
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          setSlashPosition(-1);
          setSlashQuery('');
          setSlashSelectedIndex(-1);
          return;
      }
    }

    // Handle @ dropdown navigation
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
            e.stopPropagation(); // prevent Cmd+Enter from also triggering parent form submit
            selectResult(searchResults[selectedIndex]);
            return;
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation(); // prevent Escape from also closing the parent modal
          setShowDropdown(false);
          setSearchQuery('');
          setAtSymbolPosition(-1);
          return;
      }
    } else if (!showSlashDropdown) {
      switch (e.key) {
        case 'Escape':
          textareaRef.current?.blur();
          break;
      }
    }

    // Propagate event to parent component for additional handling
    onKeyDown?.(e);
  };

  // Group results by type for rendering
  const templateResults = searchResults.filter((r) => r.type === 'template');
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
        onBlur={(e) => {
          // Track cursor position when losing focus (for image upload button clicks)
          onSelectionChange?.(e.currentTarget.selectionStart ?? value.length);
          onBlur?.(e);
        }}
        onSelect={(e) => {
          // Track cursor position on selection change
          onSelectionChange?.(e.currentTarget.selectionStart ?? value.length);
        }}
        disableInternalScroll={disableScroll}
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
              minWidth: `min(${DROPDOWN_MIN_WIDTH}px, calc(100vw - ${DROPDOWN_VIEWPORT_PADDING_TOTAL}px))`,
              maxWidth: `calc(100vw - ${DROPDOWN_VIEWPORT_PADDING_TOTAL}px)`,
              zIndex: 10000, // Higher than dialog z-[9999]
            }}
          >
            {isLoading ? (
              <div className="p-2 text-sm text-muted-foreground">
                Searching...
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">
                No templates or files found
              </div>
            ) : (
              <div className="py-1">
                {/* Templates Section */}
                {templateResults.length > 0 && (
                  <>
                    <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">
                      Templates
                    </div>
                    {templateResults.map((result) => {
                      const index = searchResults.indexOf(result);
                      const template = result.template!;
                      return (
                        <div
                          key={`template-${template.id}`}
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
                            <span>@{template.template_name}</span>
                          </div>
                          {template.content && (
                            <div className="text-xs text-muted-foreground mt-0.5 truncate">
                              {template.content.slice(0, 60)}
                              {template.content.length > 60 ? '...' : ''}
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
                    {templateResults.length > 0 && (
                      <div className="border-t my-1" />
                    )}
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

      {/* Slash command dropdown */}
      {showSlashDropdown &&
        createPortal(
          <div
            className="fixed bg-background border border-border rounded-md shadow-lg overflow-y-auto"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              maxHeight: dropdownPosition.maxHeight,
              minWidth: `min(${DROPDOWN_MIN_WIDTH}px, calc(100vw - ${DROPDOWN_VIEWPORT_PADDING_TOTAL}px))`,
              maxWidth: `calc(100vw - ${DROPDOWN_VIEWPORT_PADDING_TOTAL}px)`,
              zIndex: 10000,
            }}
          >
            {slashLoading && !slashCommandsLoaded ? (
              <div className="p-2 text-sm text-muted-foreground">
                Discovering commands...
              </div>
            ) : (
              <div className="py-1">
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase">
                  Slash Commands
                </div>
                {slashResults.map((cmd, index) => (
                  <div
                    key={cmd.name}
                    className={`px-3 py-2 cursor-pointer text-sm ${
                      index === slashSelectedIndex
                        ? 'bg-muted text-foreground'
                        : 'hover:bg-muted'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep textarea focused
                      selectSlashCommand(cmd);
                    }}
                    aria-selected={index === slashSelectedIndex}
                    role="option"
                  >
                    <div className="flex items-center gap-2 font-medium">
                      <TerminalSquare className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                      <span>/{cmd.name}</span>
                    </div>
                    {cmd.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {cmd.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
});
