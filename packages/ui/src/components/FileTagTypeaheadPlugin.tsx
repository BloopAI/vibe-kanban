import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  KEY_ESCAPE_COMMAND,
} from 'lexical';
import {
  TagIcon,
  FileTextIcon,
  GearIcon,
  PlusIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useTypeaheadOpen } from './TypeaheadOpenContext';
import { TypeaheadMenu } from './TypeaheadMenu';

const MAX_FILE_RESULTS = 10;
const DEBUG_PREFIX = '[FileTagTypeahead][position]';

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function getRectSnapshot(rect: DOMRect | null | undefined) {
  if (!rect) return null;

  return {
    left: roundToTwo(rect.left),
    top: roundToTwo(rect.top),
    right: roundToTwo(rect.right),
    bottom: roundToTwo(rect.bottom),
    width: roundToTwo(rect.width),
    height: roundToTwo(rect.height),
  };
}

function getViewportSnapshot() {
  const vv = window.visualViewport;

  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollX: roundToTwo(window.scrollX),
    scrollY: roundToTwo(window.scrollY),
    visualViewport: vv
      ? {
          width: roundToTwo(vv.width),
          height: roundToTwo(vv.height),
          offsetLeft: roundToTwo(vv.offsetLeft),
          offsetTop: roundToTwo(vv.offsetTop),
        }
      : null,
  };
}

type DiffFileResult = {
  path: string;
  name: string;
  is_file: boolean;
  match_type: 'FileName' | 'DirectoryName' | 'FullPath';
  score: bigint;
};

export type FileTagLike = {
  id: string | number;
  tag_name: string;
  content: string;
};

export type FileResultLike = {
  path: string;
  name: string;
  is_file: boolean;
  match_type: 'FileName' | 'DirectoryName' | 'FullPath';
  score: bigint | number;
};

export type SearchResultItemLike =
  | {
      type: 'tag';
      tag: FileTagLike;
    }
  | {
      type: 'file';
      file: FileResultLike;
    };

export type RepoLike = {
  id: string;
  name: string;
  display_name?: string | null;
};

type ChooseRepoResult = {
  repoId: string;
};

type SearchArgs = {
  repoIds?: string[];
};

type FileTagTypeaheadPluginProps = {
  repoIds?: string[];
  diffPaths?: Set<string>;
  preferredRepoId?: string | null;
  setPreferredRepoId?: (repoId: string | null) => void;
  listRecentRepos?: () => Promise<RepoLike[]>;
  getRepoById?: (repoId: string) => Promise<RepoLike | null>;
  chooseRepo?: (repos: RepoLike[]) => Promise<ChooseRepoResult | undefined>;
  onCreateTag?: () => Promise<boolean>;
  searchTagsAndFiles?: (
    query: string,
    args: SearchArgs
  ) => Promise<SearchResultItemLike[]>;
};

class FileTagOption extends MenuOption {
  item: SearchResultItemLike;

  constructor(item: SearchResultItemLike) {
    const key =
      item.type === 'tag' ? `tag-${item.tag.id}` : `file-${item.file.path}`;
    super(key);
    this.item = item;
  }
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
        // High score to rank diff files above server results.
        score: BigInt(Number.MAX_SAFE_INTEGER),
      };
    });
}

function getRepoDisplayName(repo: RepoLike): string {
  return repo.display_name || repo.name;
}

export function FileTagTypeaheadPlugin({
  repoIds,
  diffPaths,
  preferredRepoId,
  setPreferredRepoId,
  listRecentRepos,
  getRepoById,
  chooseRepo,
  onCreateTag,
  searchTagsAndFiles,
}: FileTagTypeaheadPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [options, setOptions] = useState<FileTagOption[]>([]);
  const [recentRepoCatalog, setRecentRepoCatalog] = useState<RepoLike[] | null>(
    null
  );
  const [preferredRepoName, setPreferredRepoName] = useState<string | null>(
    null
  );
  const [showMissingRepoState, setShowMissingRepoState] = useState(false);
  const [isChoosingRepo, setIsChoosingRepo] = useState(false);
  const { t } = useTranslation('common');
  const { setIsOpen } = useTypeaheadOpen();
  const searchRequestRef = useRef(0);
  const lastQueryRef = useRef<string | null>(null);
  const sessionIdRef = useRef(0);
  const lastTriggerLogKeyRef = useRef<string | null>(null);
  const lastAnchorLogKeyRef = useRef<string | null>(null);

  const logDebug = useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      console.debug(DEBUG_PREFIX, event, {
        sessionId: sessionIdRef.current,
        ...payload,
      });
    },
    []
  );

  const effectiveDiffPaths = useMemo(
    () => diffPaths ?? new Set<string>(),
    [diffPaths]
  );
  const usePreferenceRepoSelection = repoIds === undefined;
  const canManageRepoPreference =
    usePreferenceRepoSelection &&
    !!setPreferredRepoId &&
    !!listRecentRepos &&
    !!chooseRepo;

  const effectiveRepoIds = useMemo(() => {
    if (!usePreferenceRepoSelection) {
      return repoIds;
    }
    return preferredRepoId ? [preferredRepoId] : undefined;
  }, [preferredRepoId, repoIds, usePreferenceRepoSelection]);

  const canSearchFiles = Boolean(effectiveRepoIds && effectiveRepoIds.length);

  const loadRecentRepos = useCallback(
    async (force = false): Promise<RepoLike[]> => {
      if (!force && recentRepoCatalog !== null) {
        return recentRepoCatalog;
      }
      if (!listRecentRepos) {
        setRecentRepoCatalog([]);
        return [];
      }
      const repos = await listRecentRepos();
      setRecentRepoCatalog(repos);
      return repos;
    },
    [listRecentRepos, recentRepoCatalog]
  );

  const runSearch = useCallback(
    async (query: string, overrideRepoIds?: string[]) => {
      const requestId = ++searchRequestRef.current;
      const scopedRepoIds = overrideRepoIds ?? effectiveRepoIds;
      const fileSearchEnabled = Boolean(
        scopedRepoIds && scopedRepoIds.length > 0
      );

      const localFiles = fileSearchEnabled
        ? getMatchingDiffFiles(query, effectiveDiffPaths)
        : [];
      const localFilePaths = new Set(localFiles.map((f) => f.path));

      logDebug('search.start', {
        requestId,
        query,
        repoIds: scopedRepoIds ?? [],
        fileSearchEnabled,
        localFileCount: localFiles.length,
      });

      try {
        const serverResults = searchTagsAndFiles
          ? await searchTagsAndFiles(query, { repoIds: scopedRepoIds })
          : [];

        if (requestId !== searchRequestRef.current) {
          logDebug('search.stale', {
            requestId,
            currentRequestId: searchRequestRef.current,
            query,
          });
          return;
        }

        const tagResults = serverResults.filter((r) => r.type === 'tag');
        const serverFileResults = serverResults
          .filter((r) => r.type === 'file')
          .filter((r) => !localFilePaths.has(r.file.path));

        const limitedLocalFiles = localFiles.slice(0, MAX_FILE_RESULTS);
        const remainingSlots = MAX_FILE_RESULTS - limitedLocalFiles.length;
        const limitedServerFiles = serverFileResults.slice(0, remainingSlots);

        const mergedResults: SearchResultItemLike[] = [
          ...tagResults,
          ...limitedLocalFiles.map((file) => ({
            type: 'file' as const,
            file,
          })),
          ...limitedServerFiles,
        ];

        setOptions(mergedResults.map((result) => new FileTagOption(result)));
        logDebug('search.done', {
          requestId,
          query,
          tagCount: tagResults.length,
          localFileCount: limitedLocalFiles.length,
          serverFileCount: limitedServerFiles.length,
          totalOptionCount: mergedResults.length,
        });
      } catch (err) {
        if (requestId === searchRequestRef.current) {
          setOptions([]);
        }
        logDebug('search.error', {
          requestId,
          query,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        console.error('Failed to search tags/files', {
          requestId,
          query,
          err,
        });
      }
    },
    [effectiveDiffPaths, effectiveRepoIds, logDebug, searchTagsAndFiles]
  );

  useEffect(() => {
    if (!usePreferenceRepoSelection || !preferredRepoId || !listRecentRepos) {
      if (!preferredRepoId) {
        setPreferredRepoName(null);
      }
      return;
    }

    let canceled = false;
    void loadRecentRepos()
      .then(async (recentRepos) => {
        if (canceled) return;

        const matchingRecentRepo = recentRepos.find(
          (repo) => repo.id === preferredRepoId
        );
        if (matchingRecentRepo) {
          setPreferredRepoName(getRepoDisplayName(matchingRecentRepo));
          setShowMissingRepoState(false);
          return;
        }

        const existingRepo = getRepoById
          ? await getRepoById(preferredRepoId)
          : null;

        if (canceled) return;
        if (existingRepo) {
          setPreferredRepoName(getRepoDisplayName(existingRepo));
          setShowMissingRepoState(false);
          return;
        }

        setPreferredRepoName(null);
        setShowMissingRepoState(true);
        setPreferredRepoId?.(null);

        const queryToRefresh = lastQueryRef.current;
        if (queryToRefresh !== null) {
          void runSearch(queryToRefresh, []);
        }
      })
      .catch((err) => {
        console.error('Failed to load repos for file-search preference', err);
      });

    return () => {
      canceled = true;
    };
  }, [
    getRepoById,
    listRecentRepos,
    loadRecentRepos,
    preferredRepoId,
    runSearch,
    setPreferredRepoId,
    usePreferenceRepoSelection,
  ]);

  const handleChooseRepo = useCallback(async () => {
    if (!chooseRepo || !setPreferredRepoId) {
      return;
    }

    setIsChoosingRepo(true);
    try {
      const repos = await loadRecentRepos(true);
      const repoResult = await chooseRepo(repos);

      if (!repoResult?.repoId) {
        return;
      }

      const selectedRepo = repos.find((repo) => repo.id === repoResult.repoId);
      if (!selectedRepo) {
        return;
      }

      setPreferredRepoId(selectedRepo.id);
      setPreferredRepoName(getRepoDisplayName(selectedRepo));
      setShowMissingRepoState(false);

      const queryToRefresh = lastQueryRef.current;
      if (queryToRefresh !== null) {
        void runSearch(queryToRefresh, [selectedRepo.id]);
      }
    } catch (err) {
      console.error('Failed to choose repo for file search', err);
    } finally {
      setIsChoosingRepo(false);
    }
  }, [chooseRepo, loadRecentRepos, runSearch, setPreferredRepoId]);

  const closeTypeahead = useCallback(() => {
    editor.dispatchCommand(KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown'));
  }, [editor]);

  const handleCreateTag = useCallback(async () => {
    closeTypeahead();
    if (!onCreateTag) {
      return;
    }

    try {
      const saved = await onCreateTag();
      if (saved) {
        const queryToRefresh = lastQueryRef.current;
        if (queryToRefresh !== null) {
          void runSearch(queryToRefresh);
        }
      }
    } catch {
      // User cancelled.
    }
  }, [closeTypeahead, onCreateTag, runSearch]);

  const onQueryChange = useCallback(
    (query: string | null) => {
      if (query === null) {
        logDebug('query.cleared', {
          previousQuery: lastQueryRef.current,
          optionCount: options.length,
        });
        setOptions([]);
        return;
      }

      lastQueryRef.current = query;
      logDebug('query.changed', {
        query,
        queryLength: query.length,
        optionCount: options.length,
      });
      void runSearch(query);
    },
    [logDebug, options.length, runSearch]
  );

  const handleOpen = useCallback(() => {
    sessionIdRef.current += 1;
    lastAnchorLogKeyRef.current = null;

    const editorEl = editor.getRootElement();
    logDebug('menu.opened', {
      query: lastQueryRef.current,
      optionCount: options.length,
      canSearchFiles,
      usePreferenceRepoSelection,
      preferredRepoId,
      editorRootExists: Boolean(editorEl),
      editorRect: getRectSnapshot(editorEl?.getBoundingClientRect()),
    });

    setIsOpen(true);
  }, [
    canSearchFiles,
    editor,
    logDebug,
    options.length,
    preferredRepoId,
    setIsOpen,
    usePreferenceRepoSelection,
  ]);

  const handleClose = useCallback(() => {
    logDebug('menu.closed', {
      query: lastQueryRef.current,
      optionCount: options.length,
    });
    setIsOpen(false);
    lastAnchorLogKeyRef.current = null;
  }, [logDebug, options.length, setIsOpen]);

  return (
    <LexicalTypeaheadMenuPlugin<FileTagOption>
      triggerFn={(text) => {
        const match = /(?:^|\s)@([^\s@]*)$/.exec(text);
        if (!match) {
          if (lastTriggerLogKeyRef.current !== 'no-match') {
            lastTriggerLogKeyRef.current = 'no-match';
            logDebug('trigger.no-match', {
              textLength: text.length,
            });
          }
          return null;
        }

        const offset = match.index + match[0].indexOf('@');
        const result = {
          leadOffset: offset,
          matchingString: match[1],
          replaceableString: match[0].slice(match[0].indexOf('@')),
        };

        const triggerLogKey = `${result.leadOffset}:${result.matchingString}`;
        if (lastTriggerLogKeyRef.current !== triggerLogKey) {
          lastTriggerLogKeyRef.current = triggerLogKey;
          logDebug('trigger.match', result);
        }

        return result;
      }}
      options={options}
      onQueryChange={onQueryChange}
      onOpen={handleOpen}
      onClose={handleClose}
      onSelectOption={(option, nodeToReplace, closeMenu) => {
        editor.update(() => {
          if (!nodeToReplace) return;

          if (option.item.type === 'tag') {
            const textToInsert = option.item.tag.content ?? '';
            const textNode = $createTextNode(textToInsert);
            nodeToReplace.replace(textNode);
            textNode.select(textToInsert.length, textToInsert.length);
          } else {
            const fileName = option.item.file.name ?? '';
            const fullPath = option.item.file.path ?? '';

            const fileNameNode = $createTextNode(fileName);
            fileNameNode.toggleFormat('code');
            nodeToReplace.replace(fileNameNode);

            const spaceNode = $createTextNode(' ');
            fileNameNode.insertAfter(spaceNode);
            spaceNode.setFormat(0);
            spaceNode.select(1, 1);

            const root = $getRoot();
            const children = root.getChildren();
            let pathAlreadyExists = false;

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

            if (!pathAlreadyExists && fullPath) {
              const pathParagraph = $createParagraphNode();
              const pathNode = $createTextNode(fullPath);
              pathNode.toggleFormat('code');
              pathParagraph.append(pathNode);

              const trailingSpace = $createTextNode(' ');
              pathParagraph.append(trailingSpace);
              trailingSpace.setFormat(0);

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
        if (!anchorRef.current) {
          if (lastAnchorLogKeyRef.current !== 'missing') {
            lastAnchorLogKeyRef.current = 'missing';
            logDebug('menu.anchor.missing', {
              query: lastQueryRef.current,
              optionCount: options.length,
              viewport: getViewportSnapshot(),
            });
          }
          return null;
        }

        const tagResults = options.filter((r) => r.item.type === 'tag');
        const fileResults = options.filter((r) => r.item.type === 'file');
        const showChooseRepoControl =
          canManageRepoPreference && !canSearchFiles;
        const showSelectedRepoState = canManageRepoPreference && canSearchFiles;
        const showFilesSection =
          fileResults.length > 0 ||
          showChooseRepoControl ||
          showSelectedRepoState ||
          showMissingRepoState;
        const hasSearchResults =
          tagResults.length > 0 || fileResults.length > 0;
        const showGlobalEmptyState = !hasSearchResults && !showFilesSection;
        const selectedRepoLabel = preferredRepoName ?? preferredRepoId;
        const repoCtaLabel = showSelectedRepoState
          ? t('typeahead.selectedRepo', {
              repoName: selectedRepoLabel,
            })
          : t('typeahead.chooseRepo');
        const editorEl = editor.getRootElement();
        const anchorRect = getRectSnapshot(
          anchorRef.current.getBoundingClientRect()
        );
        const editorRect = getRectSnapshot(editorEl?.getBoundingClientRect());
        const viewport = getViewportSnapshot();

        const anchorLogKey = JSON.stringify({
          anchorRect,
          editorRect,
          viewport,
        });
        if (lastAnchorLogKeyRef.current !== anchorLogKey) {
          lastAnchorLogKeyRef.current = anchorLogKey;
          logDebug('menu.anchor.present', {
            query: lastQueryRef.current,
            selectedIndex,
            optionCount: options.length,
            tagResultCount: tagResults.length,
            fileResultCount: fileResults.length,
            showFilesSection,
            showGlobalEmptyState,
            anchorRect,
            editorRect,
            viewport,
            anchorTagName: anchorRef.current.tagName,
            anchorConnected: anchorRef.current.isConnected,
          });
        }

        return createPortal(
          <TypeaheadMenu
            anchorEl={anchorRef.current}
            onClickOutside={closeTypeahead}
          >
            <TypeaheadMenu.Header>
              <TagIcon className="size-icon-xs" weight="bold" />
              {t('typeahead.tags')}
            </TypeaheadMenu.Header>

            {showGlobalEmptyState ? (
              <TypeaheadMenu.Empty>
                {t('typeahead.noTagsOrFiles')}
              </TypeaheadMenu.Empty>
            ) : (
              <TypeaheadMenu.ScrollArea>
                <TypeaheadMenu.Action onClick={() => void handleCreateTag()}>
                  <span className="flex items-center gap-half">
                    <PlusIcon className="size-icon-xs" weight="bold" />
                    <span>{t('typeahead.createTag')}</span>
                  </span>
                </TypeaheadMenu.Action>

                {tagResults.map((option, index) => {
                  if (option.item.type !== 'tag') return null;
                  const tag = option.item.tag;
                  return (
                    <TypeaheadMenu.Item
                      key={option.key}
                      isSelected={index === selectedIndex}
                      index={index}
                      setHighlightedIndex={setHighlightedIndex}
                      onClick={() => selectOptionAndCleanUp(option)}
                    >
                      <div className="flex items-center gap-half font-medium">
                        <TagIcon
                          className="size-icon-xs shrink-0"
                          weight="bold"
                        />
                        <span>@{tag.tag_name}</span>
                      </div>
                      {tag.content && (
                        <div className="text-xs text-low truncate">
                          {tag.content.slice(0, 60)}
                          {tag.content.length > 60 ? '...' : ''}
                        </div>
                      )}
                    </TypeaheadMenu.Item>
                  );
                })}

                {showFilesSection && (
                  <>
                    {tagResults.length > 0 && <TypeaheadMenu.Divider />}
                    <TypeaheadMenu.SectionHeader>
                      {t('typeahead.files')}
                    </TypeaheadMenu.SectionHeader>
                    {showMissingRepoState && (
                      <TypeaheadMenu.Empty>
                        {t('typeahead.missingRepo')}
                      </TypeaheadMenu.Empty>
                    )}
                    {(showChooseRepoControl || showSelectedRepoState) && (
                      <TypeaheadMenu.Action
                        onClick={() => {
                          void handleChooseRepo();
                        }}
                        disabled={isChoosingRepo}
                      >
                        <span className="flex items-center gap-half">
                          <GearIcon className="size-icon-xs" weight="bold" />
                          <span>{repoCtaLabel}</span>
                        </span>
                      </TypeaheadMenu.Action>
                    )}
                    {fileResults.map((option) => {
                      if (option.item.type !== 'file') return null;
                      const index = options.indexOf(option);
                      const file = option.item.file;
                      return (
                        <TypeaheadMenu.Item
                          key={option.key}
                          isSelected={index === selectedIndex}
                          index={index}
                          setHighlightedIndex={setHighlightedIndex}
                          onClick={() => selectOptionAndCleanUp(option)}
                        >
                          <div className="flex items-center gap-half font-medium truncate">
                            <FileTextIcon
                              className="size-icon-xs shrink-0"
                              weight="bold"
                            />
                            <span>{file.name}</span>
                          </div>
                          <div className="text-xs text-low truncate">
                            {file.path}
                          </div>
                        </TypeaheadMenu.Item>
                      );
                    })}
                  </>
                )}
              </TypeaheadMenu.ScrollArea>
            )}
          </TypeaheadMenu>,
          document.body
        );
      }}
    />
  );
}
