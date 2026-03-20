/** Ambient module shims (must remain a script — no import/export). */

declare module 'pdf-parse' {
  interface PdfParseResult {
    numpages?: number;
    numrender?: number;
    info?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    text?: string;
    version?: string;
  }
  function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module 'adm-zip' {
  interface AdmZipEntry {
    entryName: string;
    getData(): Buffer;
  }
  export default class AdmZip {
    constructor(path?: string | Buffer);
    getEntries(): AdmZipEntry[];
  }
}
