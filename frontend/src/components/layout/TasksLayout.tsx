import { ReactNode, useEffect, useRef, useState, useLayoutEffect } from 'react';
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  ImperativePanelGroupHandle,
} from 'react-resizable-panels';
import { AnimatePresence, motion } from 'framer-motion';

export type LayoutMode = 'preview' | 'diffs' | null;

interface TasksLayoutProps {
  kanban: ReactNode;
  attempt: ReactNode;
  aux: ReactNode;
  hasAttempt: boolean;
  mode: LayoutMode;
  isMobile?: boolean;
}

type SplitSizes = [number, number];

const MIN_PANEL_SIZE = 20;
const DEFAULT_KANBAN_ATTEMPT: SplitSizes = [66, 34];
const DEFAULT_ATTEMPT_AUX: SplitSizes = [34, 66];

const STORAGE_KEYS = {
  V2: {
    KANBAN_ATTEMPT: 'tasksLayout.desktop.v2.kanbanAttempt',
    ATTEMPT_PREVIEW: 'tasksLayout.desktop.v2.attemptPreview',
    ATTEMPT_DIFFS: 'tasksLayout.desktop.v2.attemptDiffs',
  },
  LEGACY: {
    MAIN: 'tasksLayout.desktop.main',
    AUX: 'tasksLayout.desktop.aux',
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
    fromKey: string;
    map: (legacy: [number, number, number]) => SplitSizes;
  }
): SplitSizes {
  const existing = parseJSON<unknown>(key);
  if (isSplitSizes(existing)) {
    return existing;
  }

  if (migration) {
    const legacy = parseJSON<unknown>(migration.fromKey);
    if (isLegacySizes(legacy)) {
      const migrated = migration.map(legacy);
      persistJSON(key, migrated);
      removeStorageKey(migration.fromKey);
      return migrated;
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
    fromKey: string;
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
          initial={{ x: 16, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -16, opacity: 0 }}
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
 * DesktopSimple - Single 3-panel layout that keeps attempt mounted across all mode transitions.
 * Uses imperative setLayout to collapse the inactive side (Kanban or Aux) based on mode.
 */
function DesktopSimple({
  kanban,
  attempt,
  aux,
  mode,
}: {
  kanban: ReactNode;
  attempt: ReactNode;
  aux: ReactNode;
  mode: LayoutMode;
}) {
  const kaMigration = {
    fromKey: STORAGE_KEYS.LEGACY.MAIN,
    map: (legacy: [number, number, number]) =>
      [legacy[0], legacy[1]] as SplitSizes,
  };

  const aaMigration = {
    fromKey: STORAGE_KEYS.LEGACY.AUX,
    map: (legacy: [number, number, number]) =>
      [legacy[1], legacy[2]] as SplitSizes,
  };

  const [kaSizes] = usePersistentSplitSizes(
    STORAGE_KEYS.V2.KANBAN_ATTEMPT,
    DEFAULT_KANBAN_ATTEMPT,
    kaMigration
  );

  const aaStorageKey =
    mode === 'diffs'
      ? STORAGE_KEYS.V2.ATTEMPT_DIFFS
      : STORAGE_KEYS.V2.ATTEMPT_PREVIEW;

  const [aaSizes] = usePersistentSplitSizes(
    aaStorageKey,
    DEFAULT_ATTEMPT_AUX,
    aaMigration
  );

  const isKA = mode === null;
  const targetLayout: [number, number, number] = isKA
    ? [kaSizes[0], kaSizes[1], 0]
    : [0, aaSizes[0], aaSizes[1]];

  const groupRef = useRef<ImperativePanelGroupHandle | null>(null);

  useLayoutEffect(() => {
    if (groupRef.current) {
      groupRef.current.setLayout(targetLayout);
    }
  }, [isKA, kaSizes, aaSizes]);

  return (
    <PanelGroup
      ref={groupRef}
      direction="horizontal"
      className="h-full min-h-0"
      onLayout={(layout) => {
        if (!Array.isArray(layout) || layout.length !== 3) return;
        if (isKA) {
          persistJSON(STORAGE_KEYS.V2.KANBAN_ATTEMPT, [layout[0], layout[1]]);
        } else {
          persistJSON(aaStorageKey, [layout[1], layout[2]]);
        }
      }}
    >
      <Panel
        id="kanban"
        order={1}
        defaultSize={targetLayout[0]}
        minSize={isKA ? MIN_PANEL_SIZE : 0}
        collapsible
        collapsedSize={0}
        className="min-w-0 min-h-0 overflow-hidden"
        role="region"
        aria-label="Kanban board"
      >
        {kanban}
      </Panel>

      <PanelResizeHandle
        id="handle-ka"
        disabled={!isKA}
        aria-hidden={!isKA}
        className={
          isKA
            ? 'relative z-30 w-1 bg-border cursor-col-resize group touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background'
            : 'w-0 pointer-events-none opacity-0'
        }
        aria-label="Resize panels"
        role="separator"
        aria-orientation="vertical"
      >
        {isKA && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />
            <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-muted/90 border border-border rounded-full px-1.5 py-3 opacity-70 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shadow-sm">
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
            </div>
          </>
        )}
      </PanelResizeHandle>

      <Panel
        id="attempt"
        order={2}
        defaultSize={targetLayout[1]}
        minSize={MIN_PANEL_SIZE}
        collapsible
        collapsedSize={0}
        className="min-w-0 min-h-0 overflow-hidden"
        role="region"
        aria-label="Attempt details"
      >
        {attempt}
      </Panel>

      <PanelResizeHandle
        id="handle-aa"
        disabled={isKA}
        aria-hidden={isKA}
        className={
          !isKA
            ? 'relative z-30 w-1 bg-border cursor-col-resize group touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background'
            : 'w-0 pointer-events-none opacity-0'
        }
        aria-label="Resize panels"
        role="separator"
        aria-orientation="vertical"
      >
        {!isKA && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border" />
            <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-muted/90 border border-border rounded-full px-1.5 py-3 opacity-70 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shadow-sm">
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
            </div>
          </>
        )}
      </PanelResizeHandle>

      <Panel
        id="aux"
        order={3}
        defaultSize={targetLayout[2]}
        minSize={isKA ? 0 : MIN_PANEL_SIZE}
        collapsible
        collapsedSize={0}
        className="min-w-0 min-h-0 overflow-hidden"
        role="region"
        aria-label={mode === 'preview' ? 'Preview' : 'Diffs'}
      >
        <AuxRouter mode={mode} aux={aux} />
      </Panel>
    </PanelGroup>
  );
}

export function TasksLayout({
  kanban,
  attempt,
  aux,
  hasAttempt,
  mode,
  isMobile = false,
}: TasksLayoutProps) {
  const desktopKey = hasAttempt ? 'desktop-with-attempt' : 'kanban-only';

  const depth = hasAttempt ? 1 : 0;
  const prevDepthRef = useRef(depth);
  const dir =
    depth === prevDepthRef.current ? 0 : depth > prevDepthRef.current ? 1 : -1;

  useEffect(() => {
    prevDepthRef.current = depth;
  }, [depth]);

  if (isMobile) {
    const columns = hasAttempt ? ['0fr', '1fr', '0fr'] : ['1fr', '0fr', '0fr'];
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
          aria-label="Attempt details"
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

  if (!hasAttempt) {
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
      <DesktopSimple kanban={kanban} attempt={attempt} aux={aux} mode={mode} />
    );
  }

  const slideVariants = {
    enter: (d: number) => ({
      x: d === 0 ? 0 : d > 0 ? '100%' : '-100%',
      opacity: d === 0 ? 0 : 1,
    }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({
      x: d === 0 ? 0 : d > 0 ? '-100%' : '100%',
      opacity: d === 0 ? 0 : 1,
    }),
  };

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={desktopKey}
        className="h-full min-h-0"
        custom={dir}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
      >
        {desktopNode}
      </motion.div>
    </AnimatePresence>
  );
}
