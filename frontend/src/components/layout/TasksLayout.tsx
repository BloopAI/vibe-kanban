import { ReactNode, useEffect, useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { AnimatePresence, motion } from 'framer-motion';

export type LayoutMode = 'preview' | 'diffs' | null;

interface TasksLayoutProps {
  kanban: ReactNode;
  attempt: ReactNode;
  aux: ReactNode;
  isPanelOpen: boolean;
  mode: LayoutMode;
  isMobile?: boolean;
  rightHeader?: ReactNode;
}

type SplitSizes = [number, number];

const MIN_PANEL_SIZE = 20;
const DEFAULT_KANBAN_ATTEMPT: SplitSizes = [66, 34];
const DEFAULT_ATTEMPT_AUX: SplitSizes = [34, 66];

const STORAGE_KEYS = {
  V2: {
    KANBAN_ATTEMPT: 'tasksLayout.desktop.v2.kanbanAttempt',
    ATTEMPT_AUX: 'tasksLayout.desktop.v2.attemptAux',
  },
  LEGACY: {
    MAIN: 'tasksLayout.desktop.main',
    AUX: 'tasksLayout.desktop.aux',
    ATTEMPT_PREVIEW: 'tasksLayout.desktop.v2.attemptPreview',
    ATTEMPT_DIFFS: 'tasksLayout.desktop.v2.attemptDiffs',
  },
} as const;

function parseJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function persistJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.warn(`Failed to persist ${key}`);
  }
}

function removeStorageKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    console.warn(`Failed to remove ${key}`);
  }
}

function isSplitSizes(value: unknown): value is SplitSizes {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => typeof n === 'number')
  );
}

function isLegacySizes(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((n) => typeof n === 'number')
  );
}

/**
 * Loads panel split sizes from localStorage with automatic migration from legacy format.
 *
 * @param key - The localStorage key to read from
 * @param fallback - Default sizes if no stored value exists
 * @param migration - Optional migration config to convert legacy 3-length arrays to 2-length
 * @returns Panel sizes as [left%, right%]
 */
function loadPanelSizes(
  key: string,
  fallback: SplitSizes,
  migration?: {
    fromKeys: string[];
    map: (legacy: [number, number, number]) => SplitSizes;
  }
): SplitSizes {
  const existing = parseJSON<unknown>(key);
  if (isSplitSizes(existing)) {
    return existing;
  }

  if (migration) {
    // Try each legacy key in order
    for (const fromKey of migration.fromKeys) {
      const legacy = parseJSON<unknown>(fromKey);
      if (isLegacySizes(legacy)) {
        const migrated = migration.map(legacy);
        persistJSON(key, migrated);
        removeStorageKey(fromKey);
        return migrated;
      }
      // Also try reading as SplitSizes (for v2 legacy keys)
      if (isSplitSizes(legacy)) {
        persistJSON(key, legacy);
        removeStorageKey(fromKey);
        return legacy;
      }
    }
  }

  return fallback;
}

/**
 * Hook to manage persistent panel split sizes with localStorage.
 *
 * Automatically migrates from legacy 3-panel format to 2-panel format and cleans up old keys.
 *
 * @param key - The localStorage key for this split
 * @param fallback - Default sizes if no stored value exists
 * @param migration - Optional migration config from legacy storage
 * @returns [sizes, setSizes] tuple
 */
function usePersistentSplitSizes(
  key: string,
  fallback: SplitSizes,
  migration?: {
    fromKeys: string[];
    map: (legacy: [number, number, number]) => SplitSizes;
  }
) {
  const [sizes, setSizes] = useState<SplitSizes>(() =>
    loadPanelSizes(key, fallback, migration)
  );

  useEffect(() => {
    setSizes(loadPanelSizes(key, fallback, migration));
  }, [key]);

  return [sizes, setSizes] as const;
}

/**
 * AuxRouter - Handles nested AnimatePresence for preview/diffs transitions.
 */
function AuxRouter({ mode, aux }: { mode: LayoutMode; aux: ReactNode }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {mode && (
        <motion.div
          key={mode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          className="h-full min-h-0"
        >
          {aux}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * RightWorkArea - Contains header and Attempt/Aux content.
 * Shows just Attempt when mode === null, or Attempt | Aux split when mode !== null.
 */
function RightWorkArea({
  attempt,
  aux,
  mode,
  rightHeader,
}: {
  attempt: ReactNode;
  aux: ReactNode;
  mode: LayoutMode;
  rightHeader?: ReactNode;
}) {
  const innerMigration = {
    fromKeys: [
      STORAGE_KEYS.LEGACY.ATTEMPT_DIFFS,
      STORAGE_KEYS.LEGACY.ATTEMPT_PREVIEW,
      STORAGE_KEYS.LEGACY.AUX,
    ],
    map: (legacy: [number, number, number]) =>
      [legacy[1], legacy[2]] as SplitSizes,
  };

  const [innerSizes] = usePersistentSplitSizes(
    STORAGE_KEYS.V2.ATTEMPT_AUX,
    DEFAULT_ATTEMPT_AUX,
    innerMigration
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      {rightHeader && (
        <div className="shrink-0 sticky top-0 z-20 bg-background border-b">
          {rightHeader}
        </div>
      )}
      <div className="flex-1 min-h-0">
        {mode === null ? (
          attempt
        ) : (
          <PanelGroup
            direction="horizontal"
            className="h-full min-h-0"
            onLayout={(layout) => {
              if (!Array.isArray(layout) || layout.length !== 2) return;
              persistJSON(STORAGE_KEYS.V2.ATTEMPT_AUX, [layout[0], layout[1]]);
            }}
          >
            <Panel
              id="attempt"
              order={1}
              defaultSize={innerSizes[0]}
              minSize={MIN_PANEL_SIZE}
              collapsible
              collapsedSize={0}
              className="min-w-0 min-h-0 overflow-hidden"
              role="region"
              aria-label="Details"
            >
              {attempt}
            </Panel>

            <PanelResizeHandle
              id="handle-aa"
              className="relative z-30 w-1 bg-border cursor-col-resize group touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
              aria-label="Resize panels"
              role="separator"
              aria-orientation="vertical"
            >
              <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />
              <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-muted/90 border border-border rounded-full px-1.5 py-3 opacity-70 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shadow-sm">
                <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              </div>
            </PanelResizeHandle>

            <Panel
              id="aux"
              order={2}
              defaultSize={innerSizes[1]}
              minSize={MIN_PANEL_SIZE}
              collapsible
              collapsedSize={0}
              className="min-w-0 min-h-0 overflow-hidden"
              role="region"
              aria-label={mode === 'preview' ? 'Preview' : 'Diffs'}
            >
              <AuxRouter mode={mode} aux={aux} />
            </Panel>
          </PanelGroup>
        )}
      </div>
    </div>
  );
}

/**
 * DesktopSimple - Conditionally renders layout based on mode.
 * When mode === null: Shows Kanban | Attempt
 * When mode !== null: Hides Kanban, shows only RightWorkArea with Attempt | Aux
 */
function DesktopSimple({
  kanban,
  attempt,
  aux,
  mode,
  rightHeader,
}: {
  kanban: ReactNode;
  attempt: ReactNode;
  aux: ReactNode;
  mode: LayoutMode;
  rightHeader?: ReactNode;
}) {
  const outerMigration = {
    fromKeys: [STORAGE_KEYS.LEGACY.MAIN],
    map: (legacy: [number, number, number]) =>
      [legacy[0], legacy[1]] as SplitSizes,
  };

  const [outerSizes] = usePersistentSplitSizes(
    STORAGE_KEYS.V2.KANBAN_ATTEMPT,
    DEFAULT_KANBAN_ATTEMPT,
    outerMigration
  );

  // When preview/diffs is open, hide Kanban entirely and render only RightWorkArea
  if (mode !== null) {
    return (
      <RightWorkArea
        attempt={attempt}
        aux={aux}
        mode={mode}
        rightHeader={rightHeader}
      />
    );
  }

  // When only viewing attempt logs, show Kanban | Attempt (no aux)
  return (
    <PanelGroup
      direction="horizontal"
      className="h-full min-h-0"
      onLayout={(layout) => {
        if (!Array.isArray(layout) || layout.length !== 2) return;
        persistJSON(STORAGE_KEYS.V2.KANBAN_ATTEMPT, [layout[0], layout[1]]);
      }}
    >
      <Panel
        id="kanban"
        order={1}
        defaultSize={outerSizes[0]}
        minSize={MIN_PANEL_SIZE}
        collapsible
        collapsedSize={0}
        className="min-w-0 min-h-0 overflow-hidden"
        role="region"
        aria-label="Kanban board"
      >
        {kanban}
      </Panel>

      <PanelResizeHandle
        id="handle-kr"
        className="relative z-30 w-1 bg-border cursor-col-resize group touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        aria-label="Resize panels"
        role="separator"
        aria-orientation="vertical"
      >
        <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-muted/90 border border-border rounded-full px-1.5 py-3 opacity-70 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shadow-sm">
          <span className="w-1 h-1 rounded-full bg-muted-foreground" />
          <span className="w-1 h-1 rounded-full bg-muted-foreground" />
          <span className="w-1 h-1 rounded-full bg-muted-foreground" />
        </div>
      </PanelResizeHandle>

      <Panel
        id="right"
        order={2}
        defaultSize={outerSizes[1]}
        minSize={MIN_PANEL_SIZE}
        collapsible
        collapsedSize={0}
        className="min-w-0 min-h-0 overflow-hidden"
      >
        <RightWorkArea
          attempt={attempt}
          aux={aux}
          mode={mode}
          rightHeader={rightHeader}
        />
      </Panel>
    </PanelGroup>
  );
}

export function TasksLayout({
  kanban,
  attempt,
  aux,
  isPanelOpen,
  mode,
  isMobile = false,
  rightHeader,
}: TasksLayoutProps) {
  const desktopKey = isPanelOpen ? 'desktop-with-panel' : 'kanban-only';

  if (isMobile) {
    const columns = isPanelOpen ? ['0fr', '1fr', '0fr'] : ['1fr', '0fr', '0fr'];
    const gridTemplateColumns = `minmax(0, ${columns[0]}) minmax(0, ${columns[1]}) minmax(0, ${columns[2]})`;
    const isKanbanVisible = columns[0] !== '0fr';
    const isAttemptVisible = columns[1] !== '0fr';
    const isAuxVisible = columns[2] !== '0fr';

    return (
      <div
        className="h-full min-h-0 grid"
        style={{
          gridTemplateColumns,
          transition: 'grid-template-columns 250ms cubic-bezier(0.2, 0, 0, 1)',
        }}
      >
        <div
          className="min-w-0 min-h-0 overflow-hidden"
          aria-hidden={!isKanbanVisible}
          aria-label="Kanban board"
          role="region"
          style={{ pointerEvents: isKanbanVisible ? 'auto' : 'none' }}
        >
          {kanban}
        </div>

        <div
          className="min-w-0 min-h-0 overflow-hidden border-l"
          aria-hidden={!isAttemptVisible}
          aria-label="Details"
          role="region"
          style={{ pointerEvents: isAttemptVisible ? 'auto' : 'none' }}
        >
          {attempt}
        </div>

        <div
          className="min-w-0 min-h-0 overflow-hidden border-l"
          aria-hidden={!isAuxVisible}
          aria-label={mode === 'preview' ? 'Preview' : 'Diffs'}
          role="region"
          style={{ pointerEvents: isAuxVisible ? 'auto' : 'none' }}
        >
          {aux}
        </div>
      </div>
    );
  }

  let desktopNode: ReactNode;

  if (!isPanelOpen) {
    desktopNode = (
      <div
        className="h-full min-h-0 min-w-0 overflow-hidden"
        role="region"
        aria-label="Kanban board"
      >
        {kanban}
      </div>
    );
  } else {
    desktopNode = (
      <DesktopSimple
        kanban={kanban}
        attempt={attempt}
        aux={aux}
        mode={mode}
        rightHeader={rightHeader}
      />
    );
  }

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={desktopKey}
        className="h-full min-h-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
      >
        {desktopNode}
      </motion.div>
    </AnimatePresence>
  );
}
