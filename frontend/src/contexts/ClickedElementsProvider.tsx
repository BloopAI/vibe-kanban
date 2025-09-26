import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from 'react';
import type { OpenInEditorPayload } from '@/utils/previewBridge';

export interface ClickedEntry {
  id: string;
  payload: OpenInEditorPayload;
  timestamp: number;
  dedupeKey: string;
}

interface ClickedElementsContextType {
  elements: ClickedEntry[];
  addElement: (payload: OpenInEditorPayload) => void;
  removeElement: (id: string) => void;
  clearElements: () => void;
  generateMarkdown: () => string;
}

const ClickedElementsContext = createContext<ClickedElementsContextType | null>(
  null
);

export function useClickedElements() {
  const context = useContext(ClickedElementsContext);
  if (!context) {
    throw new Error(
      'useClickedElements must be used within a ClickedElementsProvider'
    );
  }
  return context;
}

interface ClickedElementsProviderProps {
  children: ReactNode;
  attemptId?: string;
}

const MAX_ELEMENTS = 20;

// Helpers

function normalizePath(path?: string): string {
  if (!path) return '';
  // Normalize schemes and webpack prefixes that can vary
  return path
    .replace(/^file:\/\//, '')
    .replace(/^webpack:\/\/\//, '')
    .replace(/^webpack:\/\//, '')
    .trim();
}

function normalizeClassName(className?: string): string {
  if (!className) return '';
  return className.split(/\s+/).filter(Boolean).sort().join('.');
}

function makeDedupeKey(payload: OpenInEditorPayload): string {
  const s = payload.selected;
  const ce = payload.clickedElement;
  const domBits: string[] = [];
  if (ce?.tag) domBits.push(ce.tag.toLowerCase());
  if (ce?.id) domBits.push(`#${ce.id}`);
  const normalizedClasses = normalizeClassName(ce?.className);
  if (normalizedClasses) domBits.push(`.${normalizedClasses}`);
  if (ce?.role) domBits.push(`@${ce.role}`);

  const domKey = domBits.join('');
  const locKey = [
    normalizePath(s.pathToSource),
    s.source?.lineNumber ?? '',
    s.source?.columnNumber ?? '',
  ].join(':');

  // Do not include coords to avoid jitter breaking dedupe
  return `${s.name}|${locKey}|${domKey}`;
}

// Remove heavy or unsafe props while retaining debuggability
function pruneValue(
  value: unknown,
  depth: number,
  maxString = 200,
  maxArray = 20
): unknown {
  if (depth <= 0) return '[MaxDepth]';

  if (value == null) return value;
  const t = typeof value;
  if (t === 'string')
    return (value as string).length > maxString
      ? (value as string).slice(0, maxString) + '…'
      : value;
  if (t === 'number' || t === 'boolean') return value;
  if (t === 'function') return '[Function]';
  if (t === 'bigint') return value.toString() + 'n';
  if (t === 'symbol') return value.toString();

  if (Array.isArray(value)) {
    const lim = (value as unknown[])
      .slice(0, maxArray)
      .map((v) => pruneValue(v, depth - 1, maxString, maxArray));
    if ((value as unknown[]).length > maxArray)
      lim.push(`[+${(value as unknown[]).length - maxArray} more]`);
    return lim;
  }

  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const k of Object.keys(obj)) {
      // Cap keys to keep small
      if (count++ > 50) {
        out['[TruncatedKeys]'] = true;
        break;
      }
      out[k] = pruneValue(obj[k], depth - 1, maxString, maxArray);
    }
    return out;
  }

  return '[Unknown]';
}

function stripHeavyProps(payload: OpenInEditorPayload): OpenInEditorPayload {
  // Avoid mutating caller objects
  const shallowSelected = {
    ...payload.selected,
    props: pruneValue(payload.selected.props, 2) as Record<string, unknown>,
  };

  const shallowComponents = payload.components.map((c) => ({
    ...c,
    props: pruneValue(c.props, 2) as Record<string, unknown>,
  }));

  // dataset and coords are typically small; keep as-is.
  return {
    ...payload,
    selected: shallowSelected,
    components: shallowComponents,
  };
}

function formatClickedMarkdown(entry: ClickedEntry): string {
  const { payload } = entry;
  const s = payload.selected;
  const loc = `${normalizePath(s.pathToSource)}:${s.source?.lineNumber ?? 0}${s.source?.columnNumber != null ? ':' + s.source.columnNumber : ''}`;
  const ce = payload.clickedElement;
  const domBits: string[] = [];
  if (ce?.tag) domBits.push(ce.tag.toLowerCase());
  if (ce?.id) domBits.push(`#${ce.id}`);
  const classes = normalizeClassName(ce?.className);
  if (classes) domBits.push(`.${classes}`);
  if (ce?.role) domBits.push(`@${ce.role}`);
  const dom = domBits.join('') || '(unknown)';

  return [
    `From preview click:`,
    `- DOM: ${dom}`,
    `- Component: ${s.name} (${loc})`,
  ].join('\n');
}

export function ClickedElementsProvider({
  children,
  attemptId,
}: ClickedElementsProviderProps) {
  const [elements, setElements] = useState<ClickedEntry[]>([]);

  // Clear elements when attempt changes
  useEffect(() => {
    setElements([]);
  }, [attemptId]);

  const addElement = (payload: OpenInEditorPayload) => {
    const sanitized = stripHeavyProps(payload);
    const dedupeKey = makeDedupeKey(sanitized);

    setElements((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.dedupeKey === dedupeKey) {
        return prev; // Skip consecutive duplicate
      }
      const newEntry: ClickedEntry = {
        id: crypto.randomUUID(),
        payload: sanitized,
        timestamp: Date.now(),
        dedupeKey,
      };
      const updated = [...prev, newEntry];
      return updated.length > MAX_ELEMENTS
        ? updated.slice(-MAX_ELEMENTS)
        : updated;
    });
  };

  const removeElement = (id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
  };

  const clearElements = () => {
    setElements([]);
  };

  const generateMarkdown = () => {
    if (elements.length === 0) return '';
    const header = `## Clicked Elements (${elements.length})\n\n`;
    const body = elements.map((e) => formatClickedMarkdown(e)).join('\n\n');
    return header + body;
  };

  return (
    <ClickedElementsContext.Provider
      value={{
        elements,
        addElement,
        removeElement,
        clearElements,
        generateMarkdown,
      }}
    >
      {children}
    </ClickedElementsContext.Provider>
  );
}
