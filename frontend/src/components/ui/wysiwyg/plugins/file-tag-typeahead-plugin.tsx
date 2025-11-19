import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createTextNode } from 'lexical';
import { Tag as TagIcon, FileText } from 'lucide-react';
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

export function FileTagTypeaheadPlugin({ projectId }: { projectId?: string }) {
  const [editor] = useLexicalComposerContext();
  const [options, setOptions] = useState<FileTagOption[]>([]);

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
          replaceableString: match[0],
        };
      }}
      options={options}
      onQueryChange={onQueryChange}
      onSelectOption={(option, nodeToReplace, closeMenu) => {
        editor.update(() => {
          const textToInsert =
            option.item.type === 'tag'
              ? (option.item.tag?.content ?? '')
              : (option.item.file?.path ?? '');

          if (!nodeToReplace) return;

          // Create the node we want to insert
          const textNode = $createTextNode(textToInsert);

          // Replace the trigger text (e.g., "@test") with selected content
          nodeToReplace.replace(textNode);

          // Move the cursor to the end of the inserted text
          textNode.select(textToInsert.length, textToInsert.length);
        });

        closeMenu();
      }}
      menuRenderFn={(
        anchorRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (!anchorRef.current) return null;

        const tagResults = options.filter((r) => r.item.type === 'tag');
        const fileResults = options.filter((r) => r.item.type === 'file');

        return createPortal(
          <div
            className="fixed bg-background border border-border rounded-md shadow-lg overflow-y-auto"
            style={{
              top: (anchorRef.current.getBoundingClientRect().bottom ?? 0) + 4,
              left: anchorRef.current.getBoundingClientRect().left ?? 0,
              maxHeight: 320,
              minWidth: 320,
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
                          className={`px-3 py-2 cursor-pointer text-sm ${
                            index === selectedIndex
                              ? 'bg-muted text-foreground'
                              : 'hover:bg-muted'
                          }`}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onClick={() => selectOptionAndCleanUp(option)}
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
                    {fileResults.map((option) => {
                      const index = options.indexOf(option);
                      const file = option.item.file!;
                      return (
                        <div
                          key={option.key}
                          className={`px-3 py-2 cursor-pointer text-sm ${
                            index === selectedIndex
                              ? 'bg-muted text-foreground'
                              : 'hover:bg-muted'
                          }`}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onClick={() => selectOptionAndCleanUp(option)}
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
        );
      }}
    />
  );
}
