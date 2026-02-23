import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table';
import { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  onRowSelect?: (rows: T[]) => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (updaterOrValue: ((prev: RowSelectionState) => RowSelectionState) | RowSelectionState) => void;
  pageSizeOptions?: number[];
  stickyHeader?: boolean;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  onRowSelect,
  rowSelection: controlledRowSelection,
  onRowSelectionChange: controlledSetRowSelection,
  pageSizeOptions = [10, 25, 50, 100],
  stickyHeader = true,
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>({});
  const rowSelection = controlledRowSelection ?? internalSelection;
  const setRowSelection = controlledSetRowSelection ?? setInternalSelection;
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      rowSelection,
      globalFilter,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: (updaterOrValue) => {
      setRowSelection(
        typeof updaterOrValue === 'function' ? updaterOrValue : () => updaterOrValue
      );
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
  });

  useEffect(() => {
    const rows = table.getSelectedRowModel().rows.map((r) => r.original);
    onRowSelect?.(rows);
  }, [rowSelection]);

  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;
  const pageSize = table.getState().pagination.pageSize;

  return (
    <div className={cn('flex flex-col bg-app-card border border-app-border rounded-xl shadow-sm overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className={cn(stickyHeader && 'sticky top-0 z-10 bg-admin-table-header-bg')}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b-2 border-admin-table-border">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-admin-table-header-text whitespace-nowrap"
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <button
                          type="button"
                          onClick={() => header.column.toggleSorting()}
                          className="p-0.5 rounded hover:bg-app-hover text-app-muted focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-app-card data-[sorted]:text-primary-500"
                          aria-label={`Sort by ${header.column.id}`}
                          data-sorted={header.column.getIsSorted() ? '' : undefined}
                        >
                          {header.column.getIsSorted() === 'asc' ? (
                            <ChevronUp className="w-4 h-4 text-primary-500" />
                          ) : header.column.getIsSorted() === 'desc' ? (
                            <ChevronDown className="w-4 h-4 text-primary-500" />
                          ) : (
                            <span className="w-4 h-4 inline-block opacity-50">↕</span>
                          )}
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-app-muted">
                  No rows found
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-admin-table-border hover:bg-admin-table-row-hover transition-colors',
                    row.getIsSelected() && 'bg-primary-50 dark:bg-primary-500/10'
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-sm text-app">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-admin-table-border bg-app-card">
        <div className="flex items-center gap-4">
          <span className="text-sm text-app-muted">
            {table.getFilteredSelectedRowModel().rows.length} of {table.getFilteredRowModel().rows.length} selected
          </span>
          <select
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="select-theme text-sm py-1.5 px-2 w-auto"
            aria-label="Rows per page"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n} per page
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="p-2 rounded-lg text-app-muted hover:bg-app-hover disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-app-card"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-app-muted">
            Page {pageIndex + 1} of {pageCount || 1}
          </span>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="p-2 rounded-lg text-app-muted hover:bg-app-hover disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-app-card"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function createSelectColumn<T extends { id: string }>(): ColumnDef<T, unknown> {
  return {
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el) el.indeterminate = table.getIsSomePageRowsSelected();
        }}
        onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={(e) => row.toggleSelected(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select row ${row.id}`}
      />
    ),
    size: 40,
  };
}
