import { useState, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ColumnDef<T> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  exportValue?: (value: any, row: T) => string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  sortable?: boolean;
  defaultSort?: { key: keyof T; direction: 'asc' | 'desc' };
  onSort?: (key: keyof T, direction: 'asc' | 'desc') => void;
  pagination?: boolean;
  pageSize?: number;
  totalItems?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  getRowId?: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  exportable?: boolean;
  exportFilename?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  /** When true and data length > 100, virtualize rows for better performance */
  virtualized?: boolean;
}

const DEFAULT_PAGE_SIZE = 10;
const SKELETON_ROWS = 6;

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

export function DataTable<T>({
  data,
  columns,
  isLoading = false,
  emptyMessage = 'No data found',
  emptyIcon,
  sortable = false,
  defaultSort,
  onSort,
  pagination = false,
  pageSize = DEFAULT_PAGE_SIZE,
  totalItems,
  currentPage: controlledPage,
  onPageChange,
  selectable = false,
  selectedIds,
  onSelectionChange,
  getRowId = (row: T) => (row as any).id,
  onRowClick,
  rowClassName,
  exportable = false,
  exportFilename = 'export',
  searchable = false,
  searchPlaceholder = 'Search…',
  onSearch,
  virtualized = false,
}: DataTableProps<T>) {
  const [internalPage, setInternalPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortState, setSortState] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(
    defaultSort
      ? { key: String(defaultSort.key), direction: defaultSort.direction }
      : null,
  );

  const isServerPagination = onPageChange !== undefined;
  const isServerSort = onSort !== undefined;
  const isServerSearch = onSearch !== undefined;

  const page = isServerPagination ? (controlledPage ?? 0) : internalPage;

  // --- Search (client-side) ---
  const filteredData = useMemo(() => {
    if (isServerSearch || !searchQuery) return data;
    const q = searchQuery.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = getNestedValue(row, col.key);
        return val != null && String(val).toLowerCase().includes(q);
      }),
    );
  }, [data, searchQuery, columns, isServerSearch]);

  // --- Sort (client-side) ---
  const sortedData = useMemo(() => {
    if (isServerSort || !sortState) return filteredData;
    const { key, direction } = sortState;
    return [...filteredData].sort((a, b) => {
      const aVal = getNestedValue(a, key);
      const bVal = getNestedValue(b, key);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const mult = direction === 'asc' ? 1 : -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * mult;
      }
      return String(aVal).localeCompare(String(bVal)) * mult;
    });
  }, [filteredData, sortState, isServerSort]);

  // --- Pagination (client-side) ---
  const resolvedTotal = isServerPagination
    ? (totalItems ?? data.length)
    : sortedData.length;
  const totalPages = Math.max(1, Math.ceil(resolvedTotal / pageSize));
  const paginatedData = useMemo(() => {
    if (!pagination || isServerPagination) return sortedData;
    const start = page * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, pagination, isServerPagination, page, pageSize]);

  const visibleData = pagination ? paginatedData : sortedData;
  const showFrom = pagination ? page * pageSize + 1 : 1;
  const showTo = pagination
    ? Math.min((page + 1) * pageSize, resolvedTotal)
    : resolvedTotal;

  const scrollParentRef = useRef<HTMLDivElement>(null);
  const useVirtual = virtualized && visibleData.length > 100 && !isLoading;
  const rowVirtualizer = useVirtualizer({
    count: visibleData.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });
  const virtualItems = useVirtual ? rowVirtualizer.getVirtualItems() : [];
  const totalVirtualHeight = useVirtual ? rowVirtualizer.getTotalSize() : 0;

  // --- Handlers ---
  const handleSort = useCallback(
    (key: string) => {
      const newDirection: 'asc' | 'desc' =
        sortState?.key === key && sortState.direction === 'asc'
          ? 'desc'
          : 'asc';
      setSortState({ key, direction: newDirection });
      if (isServerSort) {
        onSort!(key as keyof T, newDirection);
      }
    },
    [sortState, isServerSort, onSort],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage < 0 || newPage >= totalPages) return;
      if (isServerPagination) {
        onPageChange!(newPage);
      } else {
        setInternalPage(newPage);
      }
    },
    [totalPages, isServerPagination, onPageChange],
  );

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (!isServerPagination) setInternalPage(0);
      if (isServerSearch) onSearch!(value);
    },
    [isServerSearch, isServerPagination, onSearch],
  );

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange || !selectedIds) return;
    const pageRowIds = visibleData.map(getRowId);
    const allSelected = pageRowIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      pageRowIds.forEach((id) => next.delete(id));
    } else {
      pageRowIds.forEach((id) => next.add(id));
    }
    onSelectionChange(next);
  }, [visibleData, selectedIds, onSelectionChange, getRowId]);

  const handleSelectRow = useCallback(
    (row: T) => {
      if (!onSelectionChange || !selectedIds) return;
      const id = getRowId(row);
      const next = new Set(selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange, getRowId],
  );

  const handleExport = useCallback(() => {
    const headers = columns.map((c) => c.header);
    const rows = (pagination ? sortedData : visibleData).map((row) =>
      columns.map((col) => {
        const val = getNestedValue(row, col.key);
        if (col.exportValue) return col.exportValue(val, row);
        return val == null ? '' : String(val);
      }),
    );
    const escape = (v: string) =>
      v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    const csv = [headers.map(escape), ...rows.map((r) => r.map(escape))]
      .map((r) => r.join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFilename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [columns, sortedData, visibleData, pagination, exportFilename]);

  // --- Derived selection state ---
  const pageRowIds = useMemo(
    () => visibleData.map(getRowId),
    [visibleData, getRowId],
  );
  const allPageSelected =
    selectable &&
    pageRowIds.length > 0 &&
    pageRowIds.every((id) => selectedIds?.has(id));
  const somePageSelected =
    selectable &&
    !allPageSelected &&
    pageRowIds.some((id) => selectedIds?.has(id));
  const selectedCount = selectedIds?.size ?? 0;

  const isColumnSortable = (col: ColumnDef<T>) =>
    col.sortable !== undefined ? col.sortable : sortable;

  const showToolbar = searchable || exportable;

  // --- Render ---
  return (
    <div className="relative flex flex-col bg-app-card border border-app-border rounded-lg overflow-hidden">
      {/* Toolbar */}
      {showToolbar && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-app-border">
          {searchable ? (
            <div className="relative max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-app-bg border border-app-border text-app-text placeholder:text-app-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors duration-fast"
                aria-label="Search table"
              />
            </div>
          ) : (
            <div />
          )}
          {exportable && (
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-app-muted hover:text-app-text rounded-md hover:bg-app-hover transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Export as CSV"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div
        ref={useVirtual ? scrollParentRef : undefined}
        className={cn(
          'overflow-x-auto',
          useVirtual && 'overflow-y-auto max-h-[480px]',
        )}
      >
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-app-card border-b border-app-border">
            <tr>
              {selectable && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected;
                    }}
                    onChange={handleSelectAll}
                    role="checkbox"
                    aria-checked={
                      allPageSelected
                        ? true
                        : somePageSelected
                          ? 'mixed'
                          : false
                    }
                    aria-label="Select all rows"
                    className="w-4 h-4 rounded border-app-border text-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
                  />
                </th>
              )}
              {columns.map((col) => {
                const canSort = isColumnSortable(col);
                const isSorted = sortState?.key === col.key;
                const ariaSort = canSort
                  ? isSorted
                    ? sortState!.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined;

                return (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-app-muted whitespace-nowrap select-none',
                      canSort && 'cursor-pointer hover:text-app-text',
                    )}
                    style={col.width ? { width: col.width } : undefined}
                    aria-sort={ariaSort as React.AriaAttributes['aria-sort']}
                    onClick={canSort ? () => handleSort(col.key) : undefined}
                    onKeyDown={
                      canSort
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSort(col.key);
                            }
                          }
                        : undefined
                    }
                    tabIndex={canSort ? 0 : undefined}
                    role={canSort ? 'columnheader' : undefined}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {canSort && (
                        <span
                          className={cn(
                            'inline-flex transition-transform duration-fast',
                            !isSorted && 'opacity-30',
                          )}
                        >
                          {isSorted && sortState!.direction === 'desc' ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronUp className="w-3.5 h-3.5" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody
            style={
              useVirtual
                ? { position: 'relative', height: `${totalVirtualHeight}px` }
                : undefined
            }
          >
            {/* Loading skeleton */}
            {isLoading &&
              Array.from({ length: SKELETON_ROWS }).map((_, rowIdx) => (
                <tr
                  key={`skel-${rowIdx}`}
                  className="border-b border-app-border"
                >
                  {selectable && (
                    <td className="px-4 py-3">
                      <div className="w-4 h-4 rounded bg-app-border animate-pulse" />
                    </td>
                  )}
                  {columns.map((col, colIdx) => (
                    <td key={col.key} className="px-4 py-3">
                      <div
                        className="h-4 rounded bg-app-border animate-pulse"
                        style={{
                          width:
                            colIdx === 0
                              ? '60%'
                              : colIdx === columns.length - 1
                                ? '40%'
                                : '80%',
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}

            {/* Empty state */}
            {!isLoading && visibleData.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-16 text-center"
                >
                  <div className="flex flex-col items-center gap-3 text-app-muted">
                    {emptyIcon ?? <Inbox className="w-10 h-10 opacity-40" />}
                    <p className="text-sm">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {!isLoading && useVirtual && (
              <>
                <tr style={{ height: `${virtualItems[0]?.start ?? 0}px` }}>
                  <td colSpan={columns.length + (selectable ? 1 : 0)} className="p-0" />
                </tr>
                {virtualItems.map((virtualRow) => {
                  const row = visibleData[virtualRow.index]!;
                  const rowId = getRowId(row);
                  const isSelected = selectable && selectedIds?.has(rowId);
                  return (
                    <tr
                      key={rowId ?? virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                        height: `${virtualRow.size}px`,
                      }}
                      className={cn(
                        'border-b border-app-border transition-colors duration-fast',
                        virtualRow.index % 2 === 1 && 'bg-app-bg',
                        'hover:bg-primary-500/5',
                        isSelected && 'bg-primary-500/10 border-l-2 border-l-primary-500',
                        onRowClick && 'cursor-pointer',
                        rowClassName?.(row),
                      )}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {selectable && (
                        <td className="w-12 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={!!isSelected}
                            onChange={() => handleSelectRow(row)}
                            onClick={(e) => e.stopPropagation()}
                            role="checkbox"
                            aria-checked={!!isSelected}
                            aria-label={`Select row ${rowId}`}
                            className="w-4 h-4 rounded border-app-border text-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
                          />
                        </td>
                      )}
                      {columns.map((col) => {
                        const val = getNestedValue(row, col.key);
                        return (
                          <td
                            key={col.key}
                            className="px-4 py-3 text-[13px] text-app-text"
                          >
                            {col.render ? col.render(val, row) : (val ?? '—')}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr style={{ height: `${totalVirtualHeight - (virtualItems[virtualItems.length - 1]?.end ?? totalVirtualHeight)}px` }}>
                  <td colSpan={columns.length + (selectable ? 1 : 0)} className="p-0" />
                </tr>
              </>
            )}
            {!isLoading && !useVirtual &&
              visibleData.map((row, rowIdx) => {
                const rowId = getRowId(row);
                const isSelected = selectable && selectedIds?.has(rowId);

                return (
                  <tr
                    key={rowId ?? rowIdx}
                    className={cn(
                      'border-b border-app-border transition-colors duration-fast',
                      rowIdx % 2 === 1 && 'bg-app-bg',
                      'hover:bg-primary-500/5',
                      isSelected && 'bg-primary-500/10 border-l-2 border-l-primary-500',
                      onRowClick && 'cursor-pointer',
                      rowClassName?.(row),
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selectable && (
                      <td className="w-12 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={!!isSelected}
                          onChange={() => handleSelectRow(row)}
                          onClick={(e) => e.stopPropagation()}
                          role="checkbox"
                          aria-checked={!!isSelected}
                          aria-label={`Select row ${rowId}`}
                          className="w-4 h-4 rounded border-app-border text-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
                        />
                      </td>
                    )}
                    {columns.map((col) => {
                      const val = getNestedValue(row, col.key);
                      return (
                        <td
                          key={col.key}
                          className="px-4 py-3 text-[13px] text-app-text"
                        >
                          {col.render ? col.render(val, row) : (val ?? '—')}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && !isLoading && resolvedTotal > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-app-border bg-app-card">
          <span className="text-sm text-app-muted">
            Showing {showFrom}–{showTo} of {resolvedTotal}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 0}
              className="p-2 rounded-md text-app-muted hover:bg-app-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-app-muted tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-md text-app-muted hover:bg-app-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-primary-500"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bulk selection bar */}
      {selectable && selectedCount > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2.5 bg-app-card border border-app-border rounded-lg shadow-md">
          <span className="text-sm font-medium text-app-text">
            {selectedCount} selected
          </span>
          <button
            type="button"
            onClick={() => onSelectionChange?.(new Set())}
            className="text-sm text-app-muted hover:text-app-text transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-2 py-1"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
