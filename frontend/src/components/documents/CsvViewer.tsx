import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface CsvData {
  headers: string[];
  rows: string[][];
}

interface CsvViewerProps {
  data: CsvData;
  className?: string;
  maxRows?: number;
}

type SortDirection = 'asc' | 'desc' | null;

export function CsvViewer({ data, className, maxRows = 1000 }: CsvViewerProps) {
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<number, string>>({});

  // Filter rows based on search and column filters
  const filteredRows = useMemo(() => {
    let rows = data.rows;

    // Global search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      rows = rows.filter(row =>
        row.some(cell => cell.toLowerCase().includes(query))
      );
    }

    // Column-specific filters
    Object.entries(columnFilters).forEach(([colIdx, filter]) => {
      if (filter.trim()) {
        const idx = parseInt(colIdx);
        const filterLower = filter.toLowerCase();
        rows = rows.filter(row =>
          row[idx]?.toLowerCase().includes(filterLower)
        );
      }
    });

    return rows;
  }, [data.rows, searchQuery, columnFilters]);

  // Sort filtered rows
  const sortedRows = useMemo(() => {
    if (sortColumn === null || sortDirection === null) {
      return filteredRows;
    }

    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortColumn] || '';
      const bVal = b[sortColumn] || '';

      // Try numeric comparison first
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
      }

      // Fall back to string comparison
      const comparison = aVal.localeCompare(bVal);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Limit displayed rows
  const displayedRows = sortedRows.slice(0, maxRows);
  const hasMoreRows = sortedRows.length > maxRows;

  const handleSort = (columnIndex: number) => {
    if (sortColumn === columnIndex) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(columnIndex);
      setSortDirection('asc');
    }
  };

  const handleColumnFilter = (columnIndex: number, value: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [columnIndex]: value,
    }));
  };

  const clearFilters = () => {
    setSearchQuery('');
    setColumnFilters({});
    setSortColumn(null);
    setSortDirection(null);
  };

  const hasActiveFilters = searchQuery.trim() || Object.values(columnFilters).some(f => f.trim());

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Toolbar */}
      <div className="shrink-0 p-4 border-b bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search all columns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear filters
            </Button>
          )}
          <div className="text-sm text-muted-foreground">
            {sortedRows.length.toLocaleString()} rows
            {sortedRows.length !== data.rows.length && (
              <span> (filtered from {data.rows.length.toLocaleString()})</span>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-muted z-10">
            <tr>
              <th className="px-4 py-2 text-left font-medium border-b border-r w-12 text-muted-foreground">
                #
              </th>
              {data.headers.map((header, idx) => (
                <th key={idx} className="px-4 py-2 text-left font-medium border-b border-r min-w-[120px]">
                  <div className="space-y-2">
                    <button
                      onClick={() => handleSort(idx)}
                      className="flex items-center gap-1 hover:text-primary transition-colors w-full"
                    >
                      <span className="truncate">{header}</span>
                      {sortColumn === idx ? (
                        sortDirection === 'asc' ? (
                          <ArrowUp className="h-4 w-4 shrink-0" />
                        ) : (
                          <ArrowDown className="h-4 w-4 shrink-0" />
                        )
                      ) : (
                        <ArrowUpDown className="h-4 w-4 shrink-0 opacity-30" />
                      )}
                    </button>
                    <Input
                      placeholder="Filter..."
                      value={columnFilters[idx] || ''}
                      onChange={(e) => handleColumnFilter(idx, e.target.value)}
                      className="h-7 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-muted/50 group">
                <td className="px-4 py-2 border-b border-r text-muted-foreground text-xs">
                  {rowIdx + 1}
                </td>
                {row.map((cell, cellIdx) => (
                  <td key={cellIdx} className="px-4 py-2 border-b border-r">
                    <span className="block truncate max-w-[300px]" title={cell}>
                      {cell}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {displayedRows.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No matching rows found
          </div>
        )}
      </div>

      {/* Footer */}
      {hasMoreRows && (
        <div className="shrink-0 p-2 text-center text-xs text-muted-foreground bg-muted border-t">
          Showing {displayedRows.length.toLocaleString()} of {sortedRows.length.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}

export default CsvViewer;
