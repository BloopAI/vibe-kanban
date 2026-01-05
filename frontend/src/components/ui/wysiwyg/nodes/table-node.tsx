import {
  DecoratorNode,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
  DOMExportOutput,
  $createParagraphNode,
} from 'lexical';
import {
  MultilineElementTransformer,
  Transformer,
  TextMatchTransformer,
} from '@lexical/markdown';
import { cn } from '@/lib/utils';

/**
 * Table data structure for markdown tables.
 */
export interface TableData {
  headers: string[];
  alignments: ('left' | 'center' | 'right' | null)[];
  rows: string[][];
}

export type SerializedTableNode = Spread<
  { tableData: TableData },
  SerializedLexicalNode
>;

/**
 * Component to render a markdown table.
 */
function TableComponent({ data }: { data: TableData }): JSX.Element {
  const getAlignmentClass = (
    alignment: 'left' | 'center' | 'right' | null
  ): string => {
    switch (alignment) {
      case 'center':
        return 'text-center';
      case 'right':
        return 'text-right';
      default:
        return 'text-left';
    }
  };

  return (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse border border-border">
        <thead>
          <tr className="bg-muted/50">
            {data.headers.map((header, i) => (
              <th
                key={i}
                className={cn(
                  'border border-border px-3 py-2 text-sm font-semibold',
                  getAlignmentClass(data.alignments[i])
                )}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={rowIndex % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    'border border-border px-3 py-2 text-sm',
                    getAlignmentClass(data.alignments[cellIndex])
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Lexical decorator node for rendering markdown tables.
 */
export class TableNode extends DecoratorNode<JSX.Element> {
  __tableData: TableData;

  static getType(): string {
    return 'table';
  }

  static clone(node: TableNode): TableNode {
    return new TableNode(node.__tableData, node.__key);
  }

  constructor(tableData: TableData, key?: NodeKey) {
    super(key);
    this.__tableData = tableData;
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'lexical-table-wrapper';
    return div;
  }

  updateDOM(): false {
    return false;
  }

  static importJSON(json: SerializedTableNode): TableNode {
    return new TableNode(json.tableData);
  }

  exportJSON(): SerializedTableNode {
    return {
      type: 'table',
      version: 1,
      tableData: this.__tableData,
    };
  }

  exportDOM(): DOMExportOutput {
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';

    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    this.__tableData.headers.forEach((header, i) => {
      const th = document.createElement('th');
      th.textContent = header;
      th.style.border = '1px solid #ccc';
      th.style.padding = '8px';
      if (this.__tableData.alignments[i]) {
        th.style.textAlign = this.__tableData.alignments[i]!;
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body
    const tbody = document.createElement('tbody');
    this.__tableData.rows.forEach((row) => {
      const tr = document.createElement('tr');
      row.forEach((cell, i) => {
        const td = document.createElement('td');
        td.textContent = cell;
        td.style.border = '1px solid #ccc';
        td.style.padding = '8px';
        if (this.__tableData.alignments[i]) {
          td.style.textAlign = this.__tableData.alignments[i]!;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    return { element: table };
  }

  getTableData(): TableData {
    return this.__tableData;
  }

  decorate(): JSX.Element {
    return <TableComponent data={this.__tableData} />;
  }

  isInline(): boolean {
    return false;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }
}

export function $createTableNode(tableData: TableData): TableNode {
  return new TableNode(tableData);
}

export function $isTableNode(
  node: LexicalNode | null | undefined
): node is TableNode {
  return node instanceof TableNode;
}

/**
 * Parse a markdown table row into cells.
 */
function parseTableRow(line: string): string[] {
  // Remove leading/trailing pipes and split by pipe
  const trimmed = line.trim();
  const withoutEdgePipes = trimmed.replace(/^\||\|$/g, '');
  return withoutEdgePipes.split('|').map((cell) => cell.trim());
}

/**
 * Parse alignment from separator row.
 * :--- = left, :---: = center, ---: = right, --- = null (default)
 */
function parseAlignment(sep: string): 'left' | 'center' | 'right' | null {
  const trimmed = sep.trim();
  const hasLeftColon = trimmed.startsWith(':');
  const hasRightColon = trimmed.endsWith(':');

  if (hasLeftColon && hasRightColon) return 'center';
  if (hasRightColon) return 'right';
  if (hasLeftColon) return 'left';
  return null;
}

/**
 * Check if a line is a valid table separator row.
 */
function isSeparatorRow(line: string): boolean {
  const cells = parseTableRow(line);
  return cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

/**
 * Parse markdown table into TableData.
 */
function parseMarkdownTable(lines: string[]): TableData | null {
  if (lines.length < 2) return null;

  const headers = parseTableRow(lines[0]);
  if (headers.length === 0) return null;

  // Second line must be separator
  if (!isSeparatorRow(lines[1])) return null;

  const separators = parseTableRow(lines[1]);
  const alignments = separators.map(parseAlignment);

  // Parse remaining rows
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const row = parseTableRow(lines[i]);
    // Pad or truncate row to match header length
    while (row.length < headers.length) row.push('');
    if (row.length > headers.length) row.length = headers.length;
    rows.push(row);
  }

  return { headers, alignments, rows };
}

/**
 * Serialize TableData back to markdown format.
 */
function serializeTableToMarkdown(data: TableData): string {
  const lines: string[] = [];

  // Header row
  lines.push('| ' + data.headers.join(' | ') + ' |');

  // Separator row
  const seps = data.alignments.map((align) => {
    switch (align) {
      case 'left':
        return ':---';
      case 'center':
        return ':---:';
      case 'right':
        return '---:';
      default:
        return '---';
    }
  });
  lines.push('| ' + seps.join(' | ') + ' |');

  // Data rows
  for (const row of data.rows) {
    lines.push('| ' + row.join(' | ') + ' |');
  }

  return lines.join('\n');
}

/**
 * Regex to match the start of a markdown table (header row with pipes).
 */
const TABLE_START_REGEX = /^\s*\|.*\|.*$/;

/**
 * Check if a line could be part of a table (contains pipes).
 */
function isTableLine(line: string): boolean {
  return line.includes('|');
}

/**
 * MultilineElementTransformer for importing markdown tables.
 */
export const TABLE_IMPORT_TRANSFORMER: MultilineElementTransformer = {
  type: 'multiline-element',
  dependencies: [TableNode],
  regExpStart: TABLE_START_REGEX,
  regExpEnd: {
    optional: true,
    regExp: /^(?!\s*\|).*$|^$/,
  },
  replace: (
    rootNode,
    _children,
    startMatch,
    _endMatch,
    linesInBetween,
    isImport
  ) => {
    if (!isImport) return false;

    // Collect all table lines
    const allLines = [startMatch[0]];
    if (linesInBetween) {
      for (const line of linesInBetween) {
        if (isTableLine(line)) {
          allLines.push(line);
        } else {
          break;
        }
      }
    }

    // Need at least header + separator
    if (allLines.length < 2) return false;

    const tableData = parseMarkdownTable(allLines);
    if (!tableData) return false;

    const tableNode = $createTableNode(tableData);
    const paragraph = $createParagraphNode();
    paragraph.append(tableNode);
    rootNode.append(paragraph);

    return true;
  },
};

/**
 * Export transformer for TableNode (TextMatchTransformer for DecoratorNodes).
 */
export const TABLE_EXPORT_TRANSFORMER: TextMatchTransformer = {
  type: 'text-match',
  dependencies: [TableNode],
  export: (node) => {
    if (!$isTableNode(node)) return null;
    // Add newlines before and after to ensure the table is on its own lines
    return '\n' + serializeTableToMarkdown(node.getTableData()) + '\n';
  },
  importRegExp: /(?!)/, // Never match (import handled by multiline transformer)
  regExp: /(?!)$/, // Never match
  replace: () => {},
  trigger: '',
};

/**
 * Combined transformers for table support.
 */
export const TABLE_TRANSFORMERS: Transformer[] = [
  TABLE_EXPORT_TRANSFORMER,
  TABLE_IMPORT_TRANSFORMER,
];
