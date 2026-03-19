const HIGHLIGHT_SELECTOR = 'mark[data-vk-search-highlight="true"]';
const CUSTOM_HIGHLIGHT_KEY = 'vk-search-highlight';

function supportsCustomHighlights(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as { Highlight?: unknown }).Highlight !== 'undefined' &&
    typeof CSS !== 'undefined' &&
    'highlights' in CSS
  );
}

function collectSearchRoots(root: HTMLElement): Node[] {
  const roots: Node[] = [root];

  const stack: Element[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    if (current.shadowRoot) {
      roots.push(current.shadowRoot);
      Array.from(current.shadowRoot.children).forEach((child) => {
        stack.push(child);
      });
    }

    Array.from(current.children).forEach((child) => {
      stack.push(child);
    });
  }

  return roots;
}

function isSkippableTextNode(node: Text): boolean {
  if (!node.parentElement) return true;
  if (!node.nodeValue || !node.nodeValue.trim()) return true;

  if (node.parentElement.closest(HIGHLIGHT_SELECTOR)) return true;
  if (node.parentElement.closest('[data-vk-search-ignore="true"]')) return true;

  const tagName = node.parentElement.tagName;
  return (
    tagName === 'SCRIPT' ||
    tagName === 'STYLE' ||
    tagName === 'NOSCRIPT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'INPUT' ||
    tagName === 'SELECT'
  );
}

function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const roots = collectSearchRoots(root);

  roots.forEach((searchRoot) => {
    const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_TEXT);

    let current = walker.nextNode();
    while (current) {
      const textNode = current as Text;
      if (!isSkippableTextNode(textNode)) {
        nodes.push(textNode);
      }
      current = walker.nextNode();
    }
  });

  return nodes;
}

export function clearSearchTextHighlights(root: HTMLElement): void {
  clearSearchTextHighlightsWithKey(root, CUSTOM_HIGHLIGHT_KEY);
}

export function clearSearchTextHighlightsWithKey(
  root: HTMLElement,
  highlightKey: string
): void {
  if (supportsCustomHighlights()) {
    (CSS as { highlights: Map<string, unknown> }).highlights.delete(
      highlightKey
    );
  }

  const searchRoots = collectSearchRoots(root);
  searchRoots.forEach((searchRoot) => {
    const highlights =
      searchRoot instanceof ShadowRoot
        ? searchRoot.querySelectorAll(HIGHLIGHT_SELECTOR)
        : (searchRoot as HTMLElement).querySelectorAll(HIGHLIGHT_SELECTOR);
    highlights.forEach((el) => {
      const text = document.createTextNode(el.textContent ?? '');
      el.replaceWith(text);
    });
    if (searchRoot instanceof ShadowRoot) {
      searchRoot.normalize();
    }
  });
  root.normalize();
}

export function applySearchTextHighlights(
  root: HTMLElement,
  query: string,
  options?: { maxMatches?: number; highlightKey?: string }
): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const maxMatches = options?.maxMatches ?? Number.POSITIVE_INFINITY;
  const highlightKey = options?.highlightKey ?? CUSTOM_HIGHLIGHT_KEY;
  let count = 0;
  const textNodes = collectTextNodes(root);
  const useCustomHighlights = supportsCustomHighlights();
  const ranges: Range[] = [];

  for (const textNode of textNodes) {
    if (count >= maxMatches) break;

    const content = textNode.nodeValue ?? '';
    const lower = content.toLowerCase();
    let start = 0;
    let matchIndex = lower.indexOf(normalizedQuery, start);

    if (matchIndex === -1) continue;

    const fragment = document.createDocumentFragment();

    while (matchIndex !== -1 && count < maxMatches) {
      if (matchIndex > start) {
        fragment.appendChild(
          document.createTextNode(content.slice(start, matchIndex))
        );
      }

      const end = matchIndex + normalizedQuery.length;
      if (useCustomHighlights) {
        const range = document.createRange();
        range.setStart(textNode, matchIndex);
        range.setEnd(textNode, end);
        ranges.push(range);
      } else {
        const mark = document.createElement('mark');
        mark.dataset.vkSearchHighlight = 'true';
        mark.className = 'bg-yellow-500/35 rounded-sm px-[1px]';
        mark.textContent = content.slice(matchIndex, end);
        fragment.appendChild(mark);
      }
      count += 1;

      start = end;
      matchIndex = lower.indexOf(normalizedQuery, start);
    }

    if (!useCustomHighlights) {
      if (start < content.length) {
        fragment.appendChild(document.createTextNode(content.slice(start)));
      }
      textNode.replaceWith(fragment);
    }
  }

  if (useCustomHighlights) {
    const highlightCtor = (
      window as { Highlight: new (...args: Range[]) => unknown }
    ).Highlight;
    const highlight = new highlightCtor(...ranges);
    (
      CSS as { highlights: { set: (key: string, value: unknown) => void } }
    ).highlights.set(highlightKey, highlight);
  }

  return count;
}
