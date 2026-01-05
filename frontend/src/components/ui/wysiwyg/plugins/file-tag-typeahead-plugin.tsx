import { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {
  $createTextNode,
  $getRoot,
  $createParagraphNode,
  $isParagraphNode,
} from 'lexical';
import { Tag as TagIcon, FileText } from 'lucide-react';
import { usePortalContainer } from '@/contexts/PortalContainerContext';
import {
  searchTagsAndFiles,
  type SearchResultItem,
} from '@/lib/searchTagsAndFiles';

class FileTagOption extends MenuOption {
  item: SearchResultItem;

  constructor(item: SearchResultItem) {
    const key =
      item.type === 'tag' ? `tag-${item.tag!.id}` : `file-${item.file!.path}`;
    super(key);
    this.item = item;
  }
}

const MAX_DIALOG_HEIGHT = 320;
const VIEWPORT_MARGIN = 8;
const VERTICAL_GAP = 4;
const VERTICAL_GAP_ABOVE = 24;
const MIN_WIDTH = 320;

function getMenuPosition(anchorEl: HTMLElement) {
  const rect = anchorEl.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  const spaceAbove = rect.top;
  const spaceBelow = viewportHeight - rect.bottom;

  const showBelow = spaceBelow >= spaceAbove;

  const availableVerticalSpace = showBelow ? spaceBelow : spaceAbove;

  const maxHeight = Math.max(
    0,
    Math.min(MAX_DIALOG_HEIGHT, availableVerticalSpace - 2 * VIEWPORT_MARGIN)
  );

  let top: number | undefined;
  let bottom: number | undefined;

  if (showBelow) {
    top = rect.bottom + VERTICAL_GAP;
  } else {
    bottom = viewportHeight - rect.top + VERTICAL_GAP_ABOVE;
  }

  let left = rect.left;
  const maxLeft = viewportWidth - MIN_WIDTH - VIEWPORT_MARGIN;
  if (left > maxLeft) {
    left = Math.max(VIEWPORT_MARGIN, maxLeft);
  }

  return { top, bottom, left, maxHeight };
}

export function FileTagTypeaheadPlugin({ projectId }: { projectId?: string }) {
  const [editor] = useLexicalComposerContext();
  const [options, setOptions] = useState<FileTagOption[]>([]);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastSelectedIndexRef = useRef<number>(-1);
  const portalContainer = usePortalContainer();

  const onQueryChange = useCallback(
    (query: string | null) => {
      // Lexical uses null to indicate "no active query / close menu"
      if (query === null) {
        setOptions([]);
        return;
      }

      // Here query is a string, including possible empty string ''
      searchTagsAndFiles(query, projectId)
        .then((results) => {
          setOptions(results.map((r) => new FileTagOption(r)));
        })
        .catch((err) => {
          console.error('Failed to search tags/files', err);
        });
    },
    [projectId]
  );

  return (
    <LexicalTypeaheadMenuPlugin<FileTagOption>
      triggerFn={(text) => {
        // Match @ followed by any non-whitespace characters
        const match = /(?:^|\s)@([^\s@]*)$/.exec(text);
        if (!match) return null;
        const offset = match.index + match[0].indexOf('@');
        return {
          leadOffset: offset,
          matchingString: match[1],
          replaceableString: match[0].slice(match[0].indexOf('@')),
        };
      }}
      options={options}
      onQueryChange={onQueryChange}
      onSelectOption={(option, nodeToReplace, closeMenu) => {
        editor.update(() => {
          if (!nodeToReplace) return;

          if (option.item.type === 'tag') {
            // For tags, keep the existing behavior (insert tag content as plain text)
            const textToInsert = option.item.tag?.content ?? '';
            const textNode = $createTextNode(textToInsert);
            nodeToReplace.replace(textNode);
            textNode.select(textToInsert.length, textToInsert.length);
          } else {
            // For files, insert filename as inline code at cursor,
            // and append full path as inline code at the bottom
            const fileName = option.item.file?.name ?? '';
            const fullPath = option.item.file?.path ?? '';

            // Step 1: Insert filename as inline code at cursor position
            const fileNameNode = $createTextNode(fileName);
            fileNameNode.toggleFormat('code');
            nodeToReplace.replace(fileNameNode);

            // Add a space after the inline code for better UX
            const spaceNode = $createTextNode(' ');
            fileNameNode.insertAfter(spaceNode);
            spaceNode.select(1, 1); // Position cursor after the space

            // Step 2: Check if full path already exists at the bottom
            const root = $getRoot();
            const children = root.getChildren();
            let pathAlreadyExists = false;

            // Scan all paragraphs to find if this path already exists as inline code
            for (const child of children) {
              if (!$isParagraphNode(child)) continue;

              const textNodes = child.getAllTextNodes();
              for (const textNode of textNodes) {
                if (
                  textNode.hasFormat('code') &&
                  textNode.getTextContent() === fullPath
                ) {
                  pathAlreadyExists = true;
                  break;
                }
              }
              if (pathAlreadyExists) break;
            }

            // Step 3: If path doesn't exist, append it at the bottom
            if (!pathAlreadyExists && fullPath) {
              const pathParagraph = $createParagraphNode();
              const pathNode = $createTextNode(fullPath);
              pathNode.toggleFormat('code');
              pathParagraph.append(pathNode);
              root.append(pathParagraph);
            }
          }
        });

        closeMenu();
      }}
      menuRenderFn={(
        anchorRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (!anchorRef.current) return null;

        const { top, bottom, left, maxHeight } = getMenuPosition(
          anchorRef.current
        );

        // Scroll selected item into view when navigating with arrow keys
        if (
          selectedIndex !== null &&
          selectedIndex !== lastSelectedIndexRef.current
        ) {
          lastSelectedIndexRef.current = selectedIndex;
          setTimeout(() => {
            const itemEl = itemRefs.current.get(selectedIndex);
            if (itemEl) {
              itemEl.scrollIntoView({ block: 'nearest' });
            }
          }, 0);
        }

        const tagResults = options.filter((r) => r.item.type === 'tag');
        const fileResults = options.filter((r) => r.item.type === 'file');

        return createPortal(
          <div
            className="fixed bg-background border border-border rounded-md shadow-lg overflow-y-auto"
            style={{
              top,
              bottom,
              left,
              maxHeight,
              minWidth: MIN_WIDTH,
              zIndex: 10000,
            }}
          >
            {options.length === 0 ? (
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
                    {tagResults.map((option) => {
                      const index = options.indexOf(option);
                      const tag = option.item.tag!;
                      return (
                        <div
                          key={option.key}
                          ref={(el) => {
                            if (el) itemRefs.current.set(index, el);
                            else itemRefs.current.delete(index);
                          }}
                          className={`px-3 py-2 cursor-pointer text-sm ${
                            index === selectedIndex
                              ? 'bg-muted text-foreground text-high'
                              : 'hover:bg-muted text-muted-foreground'
                          }`}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onClick={() => selectOptionAndCleanUp(option)}
                        >
                          <div className="flex items-center gap-2 font-medium">
                            <TagIcon className="h-3.5 w-3.5 text-blue-600" />
                            <span>@{tag.tag_name}</span>
                          </div>
                          {tag.content && (
                            <div className="text-xs mt-0.5 truncate">
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
                    {fileResults.map((option) => {
                      const index = options.indexOf(option);
                      const file = option.item.file!;
                      return (
                        <div
                          key={option.key}
                          ref={(el) => {
                            if (el) itemRefs.current.set(index, el);
                            else itemRefs.current.delete(index);
                          }}
                          className={`px-3 py-2 cursor-pointer text-sm ${
                            index === selectedIndex
                              ? 'bg-muted text-foreground text-high'
                              : 'hover:bg-muted text-muted-foreground'
                          }`}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onClick={() => selectOptionAndCleanUp(option)}
                        >
                          <div className="flex items-center gap-2 font-medium truncate">
                            <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{file.name}</span>
                          </div>
                          <div className="text-xs truncate">{file.path}</div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>,
          portalContainer ?? document.body
        );
      }}
    />
  );
}
