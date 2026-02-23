import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Download, FileSpreadsheet, ArrowRight, AlertCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { adminAPI } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui';

const importSteps = [
  { id: 1, label: 'Type' },
  { id: 2, label: 'Template' },
  { id: 3, label: 'Upload' },
  { id: 4, label: 'Mapping' },
  { id: 5, label: 'Validate' },
  { id: 6, label: 'Confirm' },
];

const EXPECTED_HEADERS = ['id', 'email', 'name', 'jobTitle', 'department', 'role', 'level', 'xp', 'joinedAt'];

interface ImportRow {
  id?: string;
  email: string;
  name: string;
  jobTitle?: string;
  department?: string;
  role?: string;
  level?: number;
  xp?: number;
  joinedAt?: string;
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === ',') {
      i += 1;
      continue;
    }
    if (line[i] === '"') {
      i += 1;
      let cell = '';
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            cell += '"';
            i += 2;
          } else {
            i += 1;
            break;
          }
        } else {
          cell += line[i];
          i += 1;
        }
      }
      out.push(cell);
    } else {
      let cell = '';
      while (i < line.length && line[i] !== ',') {
        cell += line[i];
        i += 1;
      }
      out.push(cell.replace(/^"|"$/g, '').replace(/""/g, '"'));
      if (i < line.length) i += 1;
    }
  }
  return out;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headerLine = lines[0]!;
  const headers = parseCSVLine(headerLine);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]!);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = cells[j] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function csvRowToImportRow(raw: Record<string, string>): ImportRow {
  const num = (key: string) => {
    const v = raw[key];
    if (v === '' || v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    id: raw.id?.trim() || undefined,
    email: (raw.email ?? '').trim(),
    name: (raw.name ?? '').trim(),
    jobTitle: raw.jobTitle?.trim() || undefined,
    department: raw.department?.trim() || undefined,
    role: raw.role?.trim() || undefined,
    level: num('level'),
    xp: num('xp'),
    joinedAt: raw.joinedAt?.trim() || undefined,
  };
}

function validateRow(row: ImportRow, _index: number): string | null {
  if (!row.email.trim()) return 'Missing email';
  if (!row.name.trim()) return 'Missing name';
  if (row.role && !['admin', 'manager', 'employee', 'member'].includes(row.role.toLowerCase())) return 'Invalid role';
  return null;
}

function downloadTemplate() {
  const header = EXPECTED_HEADERS.join(',');
  const csv = header + '\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'employees-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function BulkImport() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [importStep, setImportStep] = useState(1);
  const [importType, setImportType] = useState('employees');
  const [importing, setImporting] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importHistory, setImportHistory] = useState<{ id: string; date: string; total: number; successful: number; failed?: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    if (importType === 'employees') {
      downloadTemplate();
      toast.success('Template downloaded');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    const isJson = file.name.toLowerCase().endsWith('.json');
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      try {
        if (isJson) {
          const data = JSON.parse(text);
          const arr = Array.isArray(data) ? data : [];
          const rows: ImportRow[] = arr.map((r: Record<string, unknown>) => ({
            id: typeof r.id === 'string' ? r.id.trim() || undefined : undefined,
            email: typeof r.email === 'string' ? r.email.trim() : '',
            name: typeof r.name === 'string' ? r.name.trim() : '',
            jobTitle: typeof r.jobTitle === 'string' ? r.jobTitle.trim() : undefined,
            department: typeof r.department === 'string' ? r.department.trim() : undefined,
            role: typeof r.role === 'string' ? r.role : undefined,
            level: typeof r.level === 'number' ? r.level : undefined,
            xp: typeof r.xp === 'number' ? r.xp : undefined,
            joinedAt: typeof r.joinedAt === 'string' ? r.joinedAt : undefined,
          }));
          setImportRows(rows);
          toast.success(`Parsed ${rows.length} rows from JSON`);
        } else {
          const rawRows = parseCSV(text);
          const rows = rawRows.map(csvRowToImportRow).filter((r) => r.email || r.name);
          setImportRows(rows);
          toast.success(`Parsed ${rows.length} rows from CSV`);
        }
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse file');
        setImportRows([]);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const validationResults = importRows.map((row, i) => ({ row, index: i + 1, error: validateRow(row, i) }));
  const validRows = validationResults.filter((r) => !r.error).map((r) => r.row);
  const invalidCount = validationResults.filter((r) => r.error).length;

  const handleImport = async () => {
    if (!userId) return;
    const toSend = validRows.length > 0 ? validRows : importRows;
    if (toSend.length === 0) {
      toast.error('No rows to import');
      return;
    }
    setImporting(true);
    try {
      const result = (await adminAPI.import.run(userId, { rows: toSend })) as {
        total: number;
        successful: number;
        failed: number;
        errors?: Array<{ row: number; message: string }>;
      };
      const failed = result.failed ?? 0;
      const successful = result.successful ?? 0;
      if (failed > 0 && result.errors?.length) {
        result.errors.slice(0, 5).forEach((e) => toast.error(`Row ${e.row}: ${e.message}`));
      }
      toast.success(`Import completed: ${successful} successful, ${failed} failed. Go to Employees to see the list — use "All departments" filter if needed.`);
      setImportHistory((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          date: new Date().toLocaleString(),
          total: result.total ?? 0,
          successful,
          failed,
        },
      ]);
      setImportRows([]);
      setImportStep(1);
    } catch {
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-app mb-6">Bulk Import / Export</h1>

      <Tabs defaultValue="import" className="space-y-6">
        <TabsList className="flex gap-1">
          <TabsTrigger value="import" className="gap-2">
            <Upload className="w-4 h-4" />
            Import
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="mt-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Import Wizard</CardTitle>
              <p className="text-sm text-app-muted mt-1">
                After importing, view employees on the Employees page. Use filter &quot;All departments&quot; to see everyone, including new imports.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-2 flex-wrap">
                {importSteps.map((step) => (
                  <div key={step.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setImportStep(step.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        importStep === step.id
                          ? 'bg-primary-500 text-white'
                          : 'bg-app-surface-tertiary text-app-muted hover:bg-app-hover'
                      }`}
                    >
                      {step.id}. {step.label}
                    </button>
                    {step.id < 6 && <ArrowRight className="w-4 h-4 text-app-muted" />}
                  </div>
                ))}
              </div>

              {importStep === 1 && (
                <div>
                  <label className="block text-sm font-medium text-app mb-2">Import type</label>
                  <select
                    value={importType}
                    onChange={(e) => setImportType(e.target.value)}
                    className="select-theme w-full max-w-xs"
                  >
                    <option value="employees">Employees</option>
                    <option value="departments">Departments</option>
                  </select>
                </div>
              )}
              {importStep === 2 && (
                <div>
                  <p className="text-sm text-app-muted mb-2">Download template for {importType}</p>
                  {importType === 'employees' && (
                    <p className="text-xs text-app-muted mb-2">
                      Template columns: {EXPECTED_HEADERS.join(', ')}
                    </p>
                  )}
                  <Button variant="secondary" className="gap-2" onClick={handleDownloadTemplate}>
                    <FileSpreadsheet className="w-4 h-4" />
                    Download CSV template
                  </Button>
                </div>
              )}
              {importStep === 3 && (
                <div>
                  <label className="block text-sm font-medium text-app-muted mb-2">Upload file (CSV or JSON)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.json"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div
                    className="border-2 border-dashed border-app-border rounded-xl p-8 text-center text-app-muted cursor-pointer hover:border-primary-500/50 hover:bg-app-surface-tertiary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                  >
                    <Upload className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Click to browse or drag and drop CSV/JSON</p>
                    {importRows.length > 0 && (
                      <p className="text-sm text-primary-500 mt-2">{importRows.length} rows loaded</p>
                    )}
                  </div>
                  {parseError && (
                    <p className="flex items-center gap-2 text-sm text-red-400 mt-2">
                      <AlertCircle className="w-4 h-4" />
                      {parseError}
                    </p>
                  )}
                </div>
              )}
              {importStep === 4 && (
                <div>
                  <p className="text-sm text-app-muted mb-2">
                    Expected columns: <code className="text-app">{EXPECTED_HEADERS.join(', ')}</code>
                  </p>
                  <p className="text-sm text-app-muted">
                    CSV must use these headers. JSON must be an array of objects with keys: email, name, and optionally id, jobTitle, department, role, level, xp, joinedAt.
                  </p>
                  <p className="text-sm text-amber-500 mt-2">
                    Each row must have a <strong>unique email</strong>. Duplicate emails update the existing employee instead of creating a new one, so you will see fewer employees than rows if emails repeat.
                  </p>
                  {importRows.length > 0 && (
                    <p className="text-sm text-primary-500 mt-2">{importRows.length} rows ready for validation.</p>
                  )}
                </div>
              )}
              {importStep === 5 && (
                <div>
                  <p className="text-sm text-app-muted mb-2">Validation</p>
                  {importRows.length === 0 ? (
                    <p className="text-sm text-app-muted">Upload a file in step 3 first.</p>
                  ) : (
                    <>
                      <p className="text-sm text-app mb-2">
                        {validRows.length} valid, {invalidCount} with errors
                      </p>
                      <div className="max-h-60 overflow-auto border border-app-border rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-app-surface-secondary">
                            <tr className="border-b border-app-border text-left text-app-muted">
                              <th className="py-2 px-2">#</th>
                              <th className="py-2 px-2">Email</th>
                              <th className="py-2 px-2">Name</th>
                              <th className="py-2 px-2">Role</th>
                              <th className="py-2 px-2">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {validationResults.map((r, i) => (
                              <tr key={i} className="border-b border-app-border">
                                <td className="py-2 px-2">{r.index}</td>
                                <td className="py-2 px-2">{r.row.email}</td>
                                <td className="py-2 px-2">{r.row.name}</td>
                                <td className="py-2 px-2">{r.row.role ?? '—'}</td>
                                <td className="py-2 px-2">
                                  {r.error ? (
                                    <span className="text-red-400">{r.error}</span>
                                  ) : (
                                    <span className="text-green-400">OK</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
              {importStep === 6 && (
                <div>
                  <p className="text-sm text-app-muted mb-2">Confirm and import</p>
                  {importRows.length === 0 ? (
                    <p className="text-sm text-app-muted">No rows to import. Go back to upload a file.</p>
                  ) : (
                    <p className="text-sm text-app">
                      {validRows.length} rows will be imported. Existing emails will be updated.
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                {importStep > 1 && (
                  <Button variant="ghost" onClick={() => setImportStep((s) => s - 1)}>
                    Back
                  </Button>
                )}
                {importStep < 6 ? (
                  <Button variant="primary" onClick={() => setImportStep((s) => s + 1)}>
                    Next
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={handleImport}
                    disabled={importing || importRows.length === 0}
                  >
                    {importing ? 'Importing…' : 'Import'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle>Import History</CardTitle>
                <Link to="/admin/employees">
                  <Button variant="secondary" size="sm" className="gap-2">
                    <Users className="w-4 h-4" />
                    View employees
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {importHistory.length === 0 ? (
                <p className="text-sm text-app-muted">No imports yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-app-border text-left text-app-muted">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Total</th>
                      <th className="py-2 px-3">Successful</th>
                      <th className="py-2 px-3">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importHistory.map((h) => (
                      <tr key={h.id} className="border-b border-app-border">
                        <td className="py-2 px-3 text-app">{h.date}</td>
                        <td className="py-2 px-3">{h.total}</td>
                        <td className="py-2 px-3 text-green-400">{h.successful}</td>
                        <td className="py-2 px-3 text-red-400">{h.failed ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="mt-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick exports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="secondary"
                className="gap-2 w-full justify-start"
                onClick={async () => {
                  if (!userId) return;
                  try {
                    const blob = await adminAPI.export.getBlob(userId, 'csv');
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'employees.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success('Export downloaded');
                  } catch {
                    toast.error('Export failed');
                  }
                }}
              >
                <Download className="w-4 h-4" />
                Export employees (CSV)
              </Button>
              <Button
                variant="secondary"
                className="gap-2 w-full justify-start"
                onClick={async () => {
                  if (!userId) return;
                  try {
                    const data = await adminAPI.export.get(userId, 'json');
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'employees.json';
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success('Export downloaded');
                  } catch {
                    toast.error('Export failed');
                  }
                }}
              >
                <Download className="w-4 h-4" />
                Export employees (JSON)
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Custom export</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-app-muted mb-4">
                Build a custom export: choose data points, filters, and format.
              </p>
              <Button variant="primary">Build export</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
