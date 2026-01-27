import { useState, useCallback, useContext, useMemo } from 'react';
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
import { useTranslation } from 'react-i18next';
import { usePortalContainer } from '@/contexts/PortalContainerContext';
import { WorkspaceContext } from '@/contexts/WorkspaceContext';
import {
  searchTagsAndFiles,
  type SearchResultItem,
} from '@/lib/searchTagsAndFiles';
import { TypeaheadMenu } from './typeahead-menu-components';

class FileTagOption extends MenuOption {
  item: SearchResultItem;

  constructor(item: SearchResultItem) {
    const key =
      item.type === 'tag' ? `tag-${item.tag!.id}` : `file-${item.file!.path}`;
    super(key);
    this.item = item;
  }
}

const MAX_FILE_RESULTS = 10;

interface DiffFileResult {
  path: string;
  name: string;
  is_file: boolean;
  match_type: 'FileName' | 'DirectoryName' | 'FullPath';
  score: bigint;
}

function getMatchingDiffFiles(
  query: string,
  diffPaths: Set<string>
): DiffFileResult[] {
  if (!query) return [];
  const lowerQuery = query.toLowerCase();
  return Array.from(diffPaths)
    .filter((path) => {
      const name = path.split('/').pop() || path;
      return (
        name.toLowerCase().includes(lowerQuery) ||
        path.toLowerCase().includes(lowerQuery)
      );
    })
    .map((path) => {
      const name = path.split('/').pop() || path;
      const nameMatches = name.toLowerCase().includes(lowerQuery);
      return {
        path,
        name,
        is_file: true,
        match_type: nameMatches ? ('FileName' as const) : ('FullPath' as const),
        // High score to rank diff files above server results
        score: BigInt(Number.MAX_SAFE_INTEGER),
      };
    });
}

export function FileTagTypeaheadPlugin({
  workspaceId,
  projectId,
}: {
  workspaceId?: string;
  projectId?: string;
}) {
  const [editor] = useLexicalComposerContext();
  const [options, setOptions] = useState<FileTagOption[]>([]);
  const portalContainer = usePortalContainer();
  const { t } = useTranslation('common');
  // Use context directly to gracefully handle missing WorkspaceProvider (old UI)
  const workspaceContext = useContext(WorkspaceContext);
  const diffPaths = useMemo(
    () => workspaceContext?.diffPaths ?? new Set<string>(),
    [workspaceContext?.diffPaths]
  );

  const onQueryChange = useCallback(
    (query: string | null) => {
      // Lexical uses null to indicate "no active query / close menu"
      if (query === null) {
        setOptions([]);
        return;
      }

      // Get local diff files first (files from current workspace changes)
      const localFiles = getMatchingDiffFiles(query, diffPaths);
      const localFilePaths = new Set(localFiles.map((f) => f.path));

      // Here query is a string, including possible empty string ''
      searchTagsAndFiles(query, { workspaceId, projectId })
        .then((serverResults) => {
          // Separate tags and files from server results
          const tagResults = serverResults.filter((r) => r.type === 'tag');
          const serverFileResults = serverResults
            .filter((r) => r.type === 'file')
            .filter((r) => !localFilePaths.has(r.file!.path)); // Dedupe

          // Limit total file results: prioritize local diff files
          const limitedLocalFiles = localFiles.slice(0, MAX_FILE_RESULTS);
          const remainingSlots = MAX_FILE_RESULTS - limitedLocalFiles.length;
          const limitedServerFiles = serverFileResults.slice(0, remainingSlots);

          // Build merged results: tags, then local files (ranked higher), then server files
          const mergedResults: SearchResultItem[] = [
            ...tagResults,
            ...limitedLocalFiles.map((file) => ({
              type: 'file' as const,
              file,
            })),
            ...limitedServerFiles,
          ];

          setOptions(mergedResults.map((r) => new FileTagOption(r)));
        })
        .catch((err) => {
          console.error('Failed to search tags/files', err);
        });
    },
    [workspaceId, projectId, diffPaths]
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

        const tagResults = options.filter((r) => r.item.type === 'tag');
        const fileResults = options.filter((r) => r.item.type === 'file');

        return createPortal(
          <TypeaheadMenu anchorEl={anchorRef.current}>
            <TypeaheadMenu.Header>
              <TagIcon className="h-3.5 w-3.5" />
              {t('typeahead.tags')}
            </TypeaheadMenu.Header>

            {options.length === 0 ? (
              <TypeaheadMenu.Empty>
                {t('typeahead.noTagsOrFiles')}
              </TypeaheadMenu.Empty>
            ) : (
              <TypeaheadMenu.ScrollArea>
                {/* Tags Section */}
                {tagResults.map((option, index) => {
                  const tag = option.item.tag!;
                  return (
                    <TypeaheadMenu.Item
                      key={option.key}
                      isSelected={index === selectedIndex}
                      index={index}
                      setHighlightedIndex={setHighlightedIndex}
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
                    </TypeaheadMenu.Item>
                  );
                })}

                {/* Files Section */}
                {fileResults.length > 0 && (
                  <>
                    {tagResults.length > 0 && <TypeaheadMenu.Divider />}
                    <TypeaheadMenu.SectionHeader>
                      {t('typeahead.files')}
                    </TypeaheadMenu.SectionHeader>
                    {fileResults.map((option) => {
                      const index = options.indexOf(option);
                      const file = option.item.file!;
                      return (
                        <TypeaheadMenu.Item
                          key={option.key}
                          isSelected={index === selectedIndex}
                          index={index}
                          setHighlightedIndex={setHighlightedIndex}
                          onClick={() => selectOptionAndCleanUp(option)}
                        >
                          <div className="flex items-center gap-2 font-medium truncate">
                            <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{file.name}</span>
                          </div>
                          <div className="text-xs truncate">{file.path}</div>
                        </TypeaheadMenu.Item>
                      );
                    })}
                  </>
                )}
              </TypeaheadMenu.ScrollArea>
            )}
          </TypeaheadMenu>,
          portalContainer ?? document.body
        );
      }}
    />
  );
}
