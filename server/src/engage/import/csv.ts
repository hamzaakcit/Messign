/**
 * Small RFC 4180 reader. Handles a UTF-8 BOM, CRLF or LF, quoted fields with embedded delimiters, quotes and newlines,
 * and picks `,` or `;` (Turkish Excel exports use `;`) from the header line. No dependency, no eval.
 */
export class CsvError extends Error {}

export interface CsvTable {
  headers: string[];
  /** One entry per data row; `line` is the 1-based line of the row's first character in the file (header = line 1). */
  rows: Array<{ line: number; cells: string[] }>;
  delimiter: ',' | ';';
}

export const MAX_CSV_ROWS = 250_000;
export const MAX_CSV_COLUMNS = 60;

function detectDelimiter(text: string): ',' | ';' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let inQuotes = false; let commas = 0; let semis = 0;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ',') commas++;
    else if (!inQuotes && ch === ';') semis++;
  }
  return semis > commas ? ';' : ',';
}

export function parseCsv(input: string): CsvTable {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text.trim() === '') throw new CsvError('The file is empty');
  const delimiter = detectDelimiter(text);
  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = []; let field = ''; let inQuotes = false; let line = 1; let recordLine = 1; let atRecordStart = true;
  const endField = () => { cells.push(field); field = ''; };
  const endRecord = () => {
    endField();
    if (!(cells.length === 1 && cells[0] === '')) records.push({ line: recordLine, cells });
    cells = []; atRecordStart = true;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (atRecordStart) { recordLine = line; atRecordStart = false; }
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else { if (ch === '\n') line++; field += ch; }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      line++;
      endRecord();
    } else field += ch;
    if (records.length > MAX_CSV_ROWS + 1) throw new CsvError(`Too many rows (max ${MAX_CSV_ROWS})`);
  }
  if (inQuotes) throw new CsvError('A quoted field is never closed');
  if (field !== '' || cells.length > 0) endRecord();
  const header = records.shift();
  if (!header) throw new CsvError('The file has no header row');
  const headers = header.cells.map((h) => h.trim().toLowerCase());
  if (headers.length > MAX_CSV_COLUMNS) throw new CsvError(`Too many columns (max ${MAX_CSV_COLUMNS})`);
  if (new Set(headers).size !== headers.length) throw new CsvError('Two columns have the same name');
  if (headers.some((h) => h === '')) throw new CsvError('A column has no name');
  return { headers, rows: records, delimiter };
}
