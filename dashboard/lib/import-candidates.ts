'use client';

import { unzipSync, strFromU8 } from 'fflate';
import { normalizePhone } from './phone';

/**
 * Candidate list import from .xlsx / .csv.
 *
 * Deliberately hand-rolled rather than pulling in a spreadsheet library: we
 * need two columns out of the first sheet, and the popular readers ship with
 * either a large dependency tree or open advisories. An .xlsx is a zip of XML,
 * and fflate (8 KB, zero deps) is enough to open it.
 */

export interface ImportedCandidate {
  name: string;
  phone: string;
}

export interface ImportRow {
  rowNumber: number;
  name: string;
  rawPhone: string;
  phone: string | null;
  error?: string;
}

export interface ImportResult {
  candidates: ImportedCandidate[];
  rejected: ImportRow[];
  /** Which columns were used, for display. */
  detected: { nameColumn: string | null; phoneColumn: string | null };
  sheetName?: string;
}

// --- xlsx plumbing ---------------------------------------------------------

/** "BC12" -> 54 (zero-based column index). */
function columnIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function textOf(el: Element | null | undefined): string {
  return el?.textContent ?? '';
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The file is not readable as a spreadsheet.');
  }
  return doc;
}

function readSharedStrings(files: Record<string, Uint8Array>): string[] {
  const raw = files['xl/sharedStrings.xml'];
  if (!raw) return [];
  const doc = parseXml(strFromU8(raw));
  // Each <si> may be split across several <t> runs when the cell has mixed
  // formatting; concatenating them is what a reader is expected to do.
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    Array.from(si.getElementsByTagName('t'))
      .map((t) => textOf(t))
      .join('')
  );
}

function sheetToRows(xml: string, shared: string[]): string[][] {
  const doc = parseXml(xml);
  const rows: string[][] = [];

  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const ref = c.getAttribute('r') || '';
      const type = c.getAttribute('t');
      let value: string;

      if (type === 's') {
        const idx = Number(textOf(c.getElementsByTagName('v')[0]));
        value = shared[idx] ?? '';
      } else if (type === 'inlineStr') {
        value = Array.from(c.getElementsByTagName('t'))
          .map((t) => textOf(t))
          .join('');
      } else {
        value = textOf(c.getElementsByTagName('v')[0]);
      }

      // Cells with no content are omitted from the XML entirely, so place each
      // value at its real column or the columns shift left.
      const at = ref ? columnIndex(ref) : cells.length;
      while (cells.length < at) cells.push('');
      cells[at] = value;
    }
    rows.push(cells);
  }

  return rows;
}

function firstSheetPath(files: Record<string, Uint8Array>): string {
  const sheets = Object.keys(files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort((a, b) => {
      const n = (s: string) => Number(/(\d+)/.exec(s)![1]);
      return n(a) - n(b);
    });
  if (sheets.length === 0) throw new Error('No worksheet found in the workbook.');
  return sheets[0];
}

// --- csv plumbing ----------------------------------------------------------

/** Minimal RFC-4180 split: handles quoted fields and embedded commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// --- column detection ------------------------------------------------------

const PHONE_HEADERS = ['phone', 'mobile', 'number', 'contact', 'cell', 'whatsapp', 'tel'];
const NAME_HEADERS = ['name', 'candidate', 'full name', 'first name', 'fullname'];

function looksLikeHeader(cells: string[]): boolean {
  const lower = cells.map((c) => c.trim().toLowerCase());
  return lower.some((c) => PHONE_HEADERS.some((h) => c.includes(h)) || NAME_HEADERS.some((h) => c.includes(h)));
}

function findColumn(header: string[], candidates: string[]): number {
  const lower = header.map((c) => c.trim().toLowerCase());
  // Exact match first, so a "Name" column beats "Company Name".
  for (const want of candidates) {
    const i = lower.indexOf(want);
    if (i !== -1) return i;
  }
  for (let i = 0; i < lower.length; i++) {
    if (candidates.some((h) => lower[i].includes(h))) return i;
  }
  return -1;
}

/**
 * Pick the column that actually holds phone numbers, when the headers don't
 * say. Whichever column parses as a valid number most often wins.
 */
function guessPhoneColumn(rows: string[][]): number {
  const width = Math.max(...rows.map((r) => r.length), 0);
  let best = -1;
  let bestHits = 0;
  for (let col = 0; col < width; col++) {
    const hits = rows.filter((r) => normalizePhone(r[col] ?? '')).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = col;
    }
  }
  return bestHits > 0 ? best : -1;
}

// --- entry point -----------------------------------------------------------

export async function parseCandidateFile(file: File): Promise<ImportResult> {
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';

  let rows: string[][];
  let sheetName: string | undefined;

  if (isCsv) {
    rows = parseCsv(await file.text());
  } else {
    const buf = new Uint8Array(await file.arrayBuffer());
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(buf);
    } catch {
      throw new Error(
        'Could not open that file. Save it as .xlsx or .csv — the older .xls format is not supported.'
      );
    }
    const path = firstSheetPath(files);
    sheetName = path.replace('xl/worksheets/', '');
    rows = sheetToRows(strFromU8(files[path]), readSharedStrings(files));
    rows = rows.filter((r) => r.some((c) => (c ?? '').trim()));
  }

  if (rows.length === 0) throw new Error('That file has no rows.');

  const hasHeader = looksLikeHeader(rows[0]);
  const header = hasHeader ? rows[0] : [];
  const body = hasHeader ? rows.slice(1) : rows;

  let phoneCol = hasHeader ? findColumn(header, PHONE_HEADERS) : -1;
  let nameCol = hasHeader ? findColumn(header, NAME_HEADERS) : -1;

  if (phoneCol === -1) phoneCol = guessPhoneColumn(body);
  if (phoneCol === -1) {
    throw new Error(
      'No phone column found. Add a "Phone" header, or make sure one column holds numbers like +919876543210.'
    );
  }
  // Without a name header, take the first non-phone column that has text.
  if (nameCol === -1) {
    const width = Math.max(...body.map((r) => r.length), 0);
    for (let i = 0; i < width; i++) {
      if (i !== phoneCol && body.some((r) => (r[i] ?? '').trim() && !normalizePhone(r[i] ?? ''))) {
        nameCol = i;
        break;
      }
    }
  }

  const candidates: ImportedCandidate[] = [];
  const rejected: ImportRow[] = [];
  const seen = new Set<string>();

  body.forEach((r, i) => {
    const rowNumber = i + (hasHeader ? 2 : 1);
    const rawPhone = (r[phoneCol] ?? '').trim();
    const name = (nameCol >= 0 ? r[nameCol] ?? '' : '').trim();

    if (!rawPhone) return; // Blank row, not an error worth reporting.

    const phone = normalizePhone(rawPhone);
    if (!phone) {
      rejected.push({ rowNumber, name, rawPhone, phone: null, error: 'Not a valid phone number' });
      return;
    }
    if (seen.has(phone)) {
      rejected.push({ rowNumber, name, rawPhone, phone, error: 'Duplicate — already in the list' });
      return;
    }

    seen.add(phone);
    candidates.push({ name: name || phone, phone });
  });

  return {
    candidates,
    rejected,
    detected: {
      nameColumn: nameCol >= 0 ? header[nameCol] || `Column ${nameCol + 1}` : null,
      phoneColumn: header[phoneCol] || `Column ${phoneCol + 1}`,
    },
    sheetName,
  };
}
