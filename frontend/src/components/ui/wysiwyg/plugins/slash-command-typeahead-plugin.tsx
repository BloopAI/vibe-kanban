import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createTextNode } from 'lexical';
import { Command as CommandIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BaseCodingAgent, SlashCommandDescription } from 'shared/types';
import { usePortalContainer } from '@/contexts/PortalContainerContext';
import { useSlashCommands } from '@/hooks/useSlashCommands';
import { useTaskAttemptId } from '@/components/ui/wysiwyg/context/task-attempt-context';
import { TypeaheadMenu } from './typeahead-menu-components';

class SlashCommandOption extends MenuOption {
  command: SlashCommandDescription;

  constructor(command: SlashCommandDescription) {
    super(`slash-command-${command.name}`);
    this.command = command;
  }
}

function filterSlashCommands(
  all: SlashCommandDescription[],
  query: string
): SlashCommandDescription[] {
  const q = query.trim().toLowerCase();
  if (!q) return all;

  const startsWith = all.filter((c) => c.name.toLowerCase().startsWith(q));
  const includes = all.filter(
    (c) => !startsWith.includes(c) && c.name.toLowerCase().includes(q)
  );
  return [...startsWith, ...includes];
}

export function SlashCommandTypeaheadPlugin({
  agent,
  repoId,
}: {
  agent: BaseCodingAgent | null;
  repoId?: string;
}) {
  const [editor] = useLexicalComposerContext();
  const portalContainer = usePortalContainer();
  const taskAttemptId = useTaskAttemptId();
  const { t } = useTranslation('common');
  const [options, setOptions] = useState<SlashCommandOption[]>([]);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);

  const slashCommandsQuery = useSlashCommands(agent, {
    workspaceId: taskAttemptId,
    repoId,
  });
  const allCommands = useMemo(
    () => slashCommandsQuery.commands ?? [],
    [slashCommandsQuery.commands]
  );
  const isLoading = !slashCommandsQuery.isInitialized && !!agent;
  const isDiscovering = slashCommandsQuery.discovering;

  const updateOptions = useCallback(
    (query: string | null) => {
      setActiveQuery(query);

      if (!agent || query === null) {
        setOptions([]);
        return;
      }

      const filtered = filterSlashCommands(allCommands, query).slice(0, 20);
      setOptions(filtered.map((c) => new SlashCommandOption(c)));
    },
    [agent, allCommands]
  );

  const hasVisibleResults = useMemo(() => {
    if (!agent || activeQuery === null) return false;
    if (isLoading || isDiscovering) return true;
    if (!activeQuery.trim()) return true;
    return options.length > 0;
  }, [agent, activeQuery, isDiscovering, isLoading, options.length]);

  // If command list loads while menu is open, refresh options.
  useEffect(() => {
    if (activeQuery === null) return;
    updateOptions(activeQuery);
  }, [activeQuery, updateOptions]);

  return (
    <LexicalTypeaheadMenuPlugin<SlashCommandOption>
      triggerFn={(text) => {
        const match = /^(\s*)\/([^\s/]*)$/.exec(text);
        if (!match) return null;

        const slashOffset = match[1].length;
        return {
          leadOffset: slashOffset,
          matchingString: match[2],
          replaceableString: match[0].slice(slashOffset),
        };
      }}
      options={options}
      onQueryChange={updateOptions}
      onSelectOption={(option, nodeToReplace, closeMenu) => {
        editor.update(() => {
          if (!nodeToReplace) return;

          const textToInsert = `/${option.command.name}`;
          const commandNode = $createTextNode(textToInsert);
          nodeToReplace.replace(commandNode);

          const spaceNode = $createTextNode(' ');
          commandNode.insertAfter(spaceNode);
          spaceNode.select(1, 1);
        });

        closeMenu();
      }}
      menuRenderFn={(
        anchorRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (!anchorRef.current) return null;
        if (!agent) return null;
        if (!hasVisibleResults) return null;

        const isEmpty =
          !isLoading && !isDiscovering && allCommands.length === 0;
        const showLoadingRow = isLoading || isDiscovering;
        const loadingText = isLoading
          ? 'Loading commands…'
          : 'Discovering commands…';

        return createPortal(
          <TypeaheadMenu anchorEl={anchorRef.current}>
            <TypeaheadMenu.Header>
              <CommandIcon className="h-3.5 w-3.5" />
              {t('typeahead.commands')}
            </TypeaheadMenu.Header>

            {isEmpty ? (
              <TypeaheadMenu.Empty>
                {t('typeahead.noCommands')}
              </TypeaheadMenu.Empty>
            ) : options.length === 0 && !showLoadingRow ? null : (
              <TypeaheadMenu.ScrollArea>
                {showLoadingRow && (
                  <div className="px-3 py-2 text-sm text-muted-foreground select-none">
                    {loadingText}
                  </div>
                )}
                {options.map((option, index) => {
                  const details = option.command.description ?? null;

                  return (
                    <TypeaheadMenu.Item
                      key={option.key}
                      isSelected={index === selectedIndex}
                      index={index}
                      setHighlightedIndex={setHighlightedIndex}
                      onClick={() => selectOptionAndCleanUp(option)}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <span className="font-mono">
                          /{option.command.name}
                        </span>
                      </div>
                      {details && (
                        <div className="text-xs mt-0.5 truncate text-muted-foreground">
                          {details}
                        </div>
                      )}
                    </TypeaheadMenu.Item>
                  );
                })}
              </TypeaheadMenu.ScrollArea>
            )}
          </TypeaheadMenu>,
          portalContainer ?? document.body
        );
      }}
    />
  );
}
