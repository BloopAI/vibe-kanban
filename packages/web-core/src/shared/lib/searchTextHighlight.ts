const HIGHLIGHT_SELECTOR = 'mark[data-vk-search-highlight="true"]';

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
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    if (!isSkippableTextNode(textNode)) {
      nodes.push(textNode);
    }
    current = walker.nextNode();
  }

  return nodes;
}

export function clearSearchTextHighlights(root: HTMLElement): void {
  const highlights = root.querySelectorAll(HIGHLIGHT_SELECTOR);
  highlights.forEach((el) => {
    const text = document.createTextNode(el.textContent ?? '');
    el.replaceWith(text);
  });
  root.normalize();
}

export function applySearchTextHighlights(
  root: HTMLElement,
  query: string
): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  let count = 0;
  const textNodes = collectTextNodes(root);

  textNodes.forEach((textNode) => {
    const content = textNode.nodeValue ?? '';
    const lower = content.toLowerCase();
    let start = 0;
    let matchIndex = lower.indexOf(normalizedQuery, start);

    if (matchIndex === -1) return;

    const fragment = document.createDocumentFragment();

    while (matchIndex !== -1) {
      if (matchIndex > start) {
        fragment.appendChild(
          document.createTextNode(content.slice(start, matchIndex))
        );
      }

      const end = matchIndex + normalizedQuery.length;
      const mark = document.createElement('mark');
      mark.dataset.vkSearchHighlight = 'true';
      mark.className = 'bg-yellow-500/35 rounded-sm px-[1px]';
      mark.textContent = content.slice(matchIndex, end);
      fragment.appendChild(mark);
      count += 1;

      start = end;
      matchIndex = lower.indexOf(normalizedQuery, start);
    }

    if (start < content.length) {
      fragment.appendChild(document.createTextNode(content.slice(start)));
    }

    textNode.replaceWith(fragment);
  });

  return count;
}
