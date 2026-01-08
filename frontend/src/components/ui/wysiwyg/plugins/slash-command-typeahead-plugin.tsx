import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createTextNode } from 'lexical';
import { Terminal, Globe, FolderOpen } from 'lucide-react';
import type { SlashCommand } from 'shared/types';

class SlashCommandOption extends MenuOption {
  command: SlashCommand;

  constructor(command: SlashCommand) {
    super(command.id);
    this.command = command;
  }
}

const MAX_DIALOG_HEIGHT = 400;
const VIEWPORT_MARGIN = 8;
const VERTICAL_GAP = 4;
const VERTICAL_GAP_ABOVE = 24;
const MIN_WIDTH = 380;
const MAX_RESULTS = 50;

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

export function SlashCommandTypeaheadPlugin() {
  const [editor] = useLexicalComposerContext();
  const [options, setOptions] = useState<SlashCommandOption[]>([]);
  const [allCommands, setAllCommands] = useState<SlashCommand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastSelectedIndexRef = useRef<number>(-1);

  // cargar comandos desde el backend al montar
  useEffect(() => {
    let mounted = true;

    const loadCommands = async () => {
      try {
        const response = await fetch('/api/filesystem/slash-commands');
        if (!response.ok) {
          throw new Error('Failed to load commands: ' + response.statusText);
        }
        const data = await response.json();
        if (mounted) {
          setAllCommands(data.data || []);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to load slash commands:', err);
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to load commands'
          );
          setIsLoading(false);
        }
      }
    };

    loadCommands();

    return () => {
      mounted = false;
    };
  }, []);

  const onQueryChange = useCallback(
    (query: string | null) => {
      // Lexical usa null para "cerrar menu"
      if (query === null) {
        setOptions([]);
        return;
      }

      if (isLoading || allCommands.length === 0) {
        setOptions([]);
        return;
      }

      // filtrar comandos por prefijo sin distinguir mayúsculas
      const searchTerm = query.toLowerCase();
      const filtered = allCommands
        .filter((cmd) => cmd.name.toLowerCase().startsWith(searchTerm))
        .slice(0, MAX_RESULTS)
        .map((cmd) => new SlashCommandOption(cmd));

      setOptions(filtered);
    },
    [allCommands, isLoading]
  );

  return (
    <LexicalTypeaheadMenuPlugin<SlashCommandOption>
      triggerFn={(text) => {
        // detectar / al inicio de linea o después de espacio/salto
        const pattern = /(?:^|\s)(\/[^\s]*)$/;
        const match = pattern.exec(text);
        if (!match) return null;
        const offset = match.index + match[0].indexOf('/');
        return {
          leadOffset: offset,
          matchingString: match[1].slice(1), // quitar el / inicial
          replaceableString: match[0].slice(match[0].indexOf('/')),
        };
      }}
      options={options}
      onQueryChange={onQueryChange}
      onSelectOption={(option, nodeToReplace, closeMenu) => {
        editor.update(() => {
          if (!nodeToReplace) return;

          // insertar el nombre del comando (sin /)
          const commandText = '/' + option.command.name;
          const textNode = $createTextNode(commandText);
          nodeToReplace.replace(textNode);

          // posicionar cursor al final
          textNode.select(commandText.length, commandText.length);
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

        // scroll automático al item seleccionado
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

        const globalCommands = options.filter(
          (opt) => opt.command.category === 'global'
        );
        const projectCommands = options.filter(
          (opt) => opt.command.category === 'project'
        );

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
            {isLoading ? (
              <div className="p-3 text-sm text-muted-foreground">
                Loading commands...
              </div>
            ) : error ? (
              <div className="p-3 text-sm text-destructive">
                Error: {error}
              </div>
            ) : options.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                No commands found
              </div>
            ) : (
              <div className="py-1">
                {/* global commands */}
                {globalCommands.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                      <Globe className="h-3 w-3" />
                      Global Commands
                    </div>
                    {globalCommands.map((option) => {
                      const index = options.indexOf(option);
                      const cmd = option.command;
                      return (
                        <div
                          key={option.key}
                          ref={(el) => {
                            if (el) itemRefs.current.set(index, el);
                            else itemRefs.current.delete(index);
                          }}
                          className={'px-3 py-2.5 cursor-pointer ' + (index === selectedIndex
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent/50')}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onClick={() => selectOptionAndCleanUp(option)}
                        >
                          <div className="flex items-center gap-2 font-medium text-sm">
                            <Terminal className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-mono">/{cmd.name}</span>
                          </div>
                          {cmd.description && (
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {cmd.description}
                            </div>
                          )}
                          {cmd.examples && cmd.examples.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-1 font-mono opacity-75">
                              {cmd.examples[0]}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {/* project commands */}
                {projectCommands.length > 0 && (
                  <>
                    {globalCommands.length > 0 && (
                      <div className="border-t my-1" />
                    )}
                    <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                      <FolderOpen className="h-3 w-3" />
                      Project Commands
                    </div>
                    {projectCommands.map((option) => {
                      const index = options.indexOf(option);
                      const cmd = option.command;
                      return (
                        <div
                          key={option.key}
                          ref={(el) => {
                            if (el) itemRefs.current.set(index, el);
                            else itemRefs.current.delete(index);
                          }}
                          className={'px-3 py-2.5 cursor-pointer ' + (index === selectedIndex
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-accent/50')}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          onClick={() => selectOptionAndCleanUp(option)}
                        >
                          <div className="flex items-center gap-2 font-medium text-sm">
                            <Terminal className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="font-mono">/{cmd.name}</span>
                          </div>
                          {cmd.description && (
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {cmd.description}
                            </div>
                          )}
                          {cmd.examples && cmd.examples.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-1 font-mono opacity-75">
                              {cmd.examples[0]}
                            </div>
                          )}
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
