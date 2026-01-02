import { useMemo } from 'react';
import { TreeView, type TreeDataItem } from '@/components/ui/tree-view';
import { Hash, FileText } from 'lucide-react';

interface HeadingNode {
  id: string;
  text: string;
  level: number;
  line: number;
  children: HeadingNode[];
}

interface DocumentOutlineProps {
  content: string;
  onHeadingClick?: (line: number) => void;
  className?: string;
}

/**
 * Parses markdown content and extracts headings
 */
function parseMarkdownHeadings(content: string): HeadingNode[] {
  const lines = content.split('\n');
  const headings: { text: string; level: number; line: number }[] = [];

  lines.forEach((line, index) => {
    // Match markdown headings (# to ######)
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        text: match[2].trim(),
        level: match[1].length,
        line: index + 1,
      });
    }
  });

  return buildHeadingTree(headings);
}

/**
 * Builds a tree structure from flat heading list
 */
function buildHeadingTree(
  headings: { text: string; level: number; line: number }[]
): HeadingNode[] {
  const root: HeadingNode[] = [];
  const stack: { node: HeadingNode; level: number }[] = [];

  headings.forEach((heading, index) => {
    const node: HeadingNode = {
      id: `heading-${index}-${heading.line}`,
      text: heading.text,
      level: heading.level,
      line: heading.line,
      children: [],
    };

    // Pop stack until we find a parent with lower level
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      // This is a root-level heading
      root.push(node);
    } else {
      // Add as child of the last item in stack
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, level: heading.level });
  });

  return root;
}

/**
 * Converts HeadingNode tree to TreeDataItem format
 */
function headingsToTreeData(
  headings: HeadingNode[],
  onHeadingClick?: (line: number) => void
): TreeDataItem[] {
  return headings.map((heading) => ({
    id: heading.id,
    name: heading.text,
    icon: Hash,
    onClick: () => onHeadingClick?.(heading.line),
    children:
      heading.children.length > 0
        ? headingsToTreeData(heading.children, onHeadingClick)
        : undefined,
  }));
}

export function DocumentOutline({
  content,
  onHeadingClick,
  className,
}: DocumentOutlineProps) {
  const treeData = useMemo(() => {
    if (!content) return [];
    const headings = parseMarkdownHeadings(content);
    return headingsToTreeData(headings, onHeadingClick);
  }, [content, onHeadingClick]);

  if (treeData.length === 0) {
    return (
      <div className={className}>
        <div className="text-sm text-muted-foreground p-4 text-center">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No headings found</p>
          <p className="text-xs mt-1">
            Add headings (# H1, ## H2, etc.) to see the outline
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-2">
        Outline
      </div>
      <TreeView
        data={treeData}
        expandAll
        defaultNodeIcon={Hash}
        defaultLeafIcon={Hash}
        className="text-sm"
      />
    </div>
  );
}

export default DocumentOutline;
