import { ReactNode, useEffect, useRef, useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
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
  }, [key, fallback, migration]);

  useEffect(() => {
    persistJSON(key, sizes);
  }, [key, sizes]);

  return [sizes, setSizes] as const;
}

/**
 * Resize handle divider with visual affordance.
 *
 * Includes a subtle vertical line and a hoverable grip indicator with three dots
 * for improved discoverability. Fully keyboard-accessible with focus ring.
 */
function Divider() {
  return (
    <PanelResizeHandle
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
  );
}

/**
 * Generic two-panel split with resizable divider and localStorage persistence.
 *
 * This component manages a horizontal split between two panels, persisting the
 * user's preferred sizes and supporting migration from legacy storage formats.
 *
 * Panel sizes are stored as percentages that sum to ~100.
 */
function TwoPanelSplit({
  left,
  right,
  leftLabel,
  rightLabel,
  storageKey,
  defaultSizes,
  minLeft = MIN_PANEL_SIZE,
  minRight = MIN_PANEL_SIZE,
  leftClassName = 'min-w-0 min-h-0 overflow-hidden',
  rightClassName = 'min-w-0 min-h-0 overflow-hidden border-l',
  migration,
}: {
  left: ReactNode;
  right: ReactNode;
  leftLabel: string;
  rightLabel: string;
  storageKey: string;
  defaultSizes: SplitSizes;
  minLeft?: number;
  minRight?: number;
  leftClassName?: string;
  rightClassName?: string;
  migration?: {
    fromKey: string;
    map: (legacy: [number, number, number]) => SplitSizes;
  };
}) {
  const [sizes, setSizes] = usePersistentSplitSizes(
    storageKey,
    defaultSizes,
    migration
  );

  return (
    <PanelGroup
      key={storageKey}
      direction="horizontal"
      onLayout={(layout) => {
        if (Array.isArray(layout) && layout.length === 2) {
          setSizes([layout[0], layout[1]]);
        }
      }}
      className="h-full min-h-0"
    >
      <Panel
        defaultSize={sizes[0]}
        minSize={minLeft}
        collapsible
        collapsedSize={0}
        className={leftClassName}
        role="region"
        aria-label={leftLabel}
      >
        {left}
      </Panel>

      <Divider />

      <Panel
        defaultSize={sizes[1]}
        minSize={minRight}
        collapsible
        collapsedSize={0}
        className={rightClassName}
        role="region"
        aria-label={rightLabel}
      >
        {right}
      </Panel>
    </PanelGroup>
  );
}

function DesktopKanbanAttempt({
  kanban,
  attempt,
}: {
  kanban: ReactNode;
  attempt: ReactNode;
}) {
  const migration = {
    fromKey: STORAGE_KEYS.LEGACY.MAIN,
    map: (legacy: [number, number, number]) =>
      [legacy[0], legacy[1]] as SplitSizes,
  };

  return (
    <TwoPanelSplit
      left={kanban}
      right={attempt}
      leftLabel="Kanban board"
      rightLabel="Attempt details"
      storageKey={STORAGE_KEYS.V2.KANBAN_ATTEMPT}
      defaultSizes={DEFAULT_KANBAN_ATTEMPT}
      migration={migration}
    />
  );
}

function DesktopAttemptAux({
  attempt,
  aux,
  auxLabel,
  storageKey,
  migrateFromLegacy = true,
}: {
  attempt: ReactNode;
  aux: ReactNode;
  auxLabel: 'Preview' | 'Diffs';
  storageKey: string;
  migrateFromLegacy?: boolean;
}) {
  const migration = migrateFromLegacy
    ? {
        fromKey: STORAGE_KEYS.LEGACY.AUX,
        map: (legacy: [number, number, number]) =>
          [legacy[1], legacy[2]] as SplitSizes,
      }
    : undefined;

  return (
    <TwoPanelSplit
      left={attempt}
      right={aux}
      leftLabel="Attempt details"
      rightLabel={auxLabel}
      storageKey={storageKey}
      defaultSizes={DEFAULT_ATTEMPT_AUX}
      migration={migration}
    />
  );
}

const KEY_DEPTH: Record<string, number> = {
  'kanban-only': 0,
  'kanban-attempt': 1,
  'attempt-preview': 2,
  'attempt-diffs': 2,
};

export function TasksLayout({
  kanban,
  attempt,
  aux,
  hasAttempt,
  mode,
  isMobile = false,
}: TasksLayoutProps) {
  const desktopKey = !hasAttempt
    ? 'kanban-only'
    : mode === 'preview'
      ? 'attempt-preview'
      : mode === 'diffs'
        ? 'attempt-diffs'
        : 'kanban-attempt';

  const depth = KEY_DEPTH[desktopKey] ?? 0;
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
    switch (mode) {
      case null:
        desktopNode = (
          <DesktopKanbanAttempt kanban={kanban} attempt={attempt} />
        );
        break;
      case 'preview':
        desktopNode = (
          <DesktopAttemptAux
            attempt={attempt}
            aux={aux}
            auxLabel="Preview"
            storageKey={STORAGE_KEYS.V2.ATTEMPT_PREVIEW}
            migrateFromLegacy
          />
        );
        break;
      case 'diffs':
        desktopNode = (
          <DesktopAttemptAux
            attempt={attempt}
            aux={aux}
            auxLabel="Diffs"
            storageKey={STORAGE_KEYS.V2.ATTEMPT_DIFFS}
            migrateFromLegacy
          />
        );
        break;
      default:
        desktopNode = (
          <DesktopKanbanAttempt kanban={kanban} attempt={attempt} />
        );
    }
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
