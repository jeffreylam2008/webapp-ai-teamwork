import dbService from '@/lib/database';
import { systemLogger, userActionLogger } from '@/lib/simple-logger';

export type MasterDataType =
  | 'customers'
  | 'suppliers'
  | 'districts'
  | 'prefixes'
  | 'payment-methods'
  | 'payment-terms';

/** Import merges by key (insert/update); full-table replace is not allowed. */
export type ImportMode = 'upsert';

export interface ImportSummary {
  type: MasterDataType;
  mode: ImportMode;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: { rowIndex: number; message: string }[];
}

function toTrimmedString(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function parseStatusActive(v: unknown): string {
  // Normalize various representations into ERP-friendly status strings.
  const s = toTrimmedString(v).toLowerCase();
  if (!s) return '';
  if (s === '1' || s === 'true' || s === 'active' || s === 'open') return 'Active';
  if (s === '0' || s === 'false' || s === 'inactive' || s === 'closed') return 'Closed';
  // Pass through unknown status (e.g. 'Closed' already)
  const normalized = toTrimmedString(v);
  return normalized;
}

function parseBoolToStatus0or1(v: unknown): number {
  const s = toTrimmedString(v).toLowerCase();
  if (!s) return 0;
  if (s === '1' || s === 'true' || s === 'active' || s === 'open') return 1;
  if (s === '0' || s === 'false' || s === 'inactive' || s === 'closed') return 0;
  if (s === 'yes') return 1;
  if (s === 'no') return 0;
  return 0;
}

function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 5);

  const candidates: string[] = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;

  for (const c of candidates) {
    const count = lines.reduce((acc, line) => acc + (line.split(c).length - 1), 0);
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }

  // Default to comma if all candidates look empty.
  return bestCount <= 0 ? ',' : best;
}

function parseCsv(text: string, delimiter: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    // Ignore empty trailing row
    if (row.some((c) => c.trim().length > 0)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1]!;

    if (ch === '"') {
      if (inQuotes && next === '"') {
        // Escaped quote
        field += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      pushField();
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      // Handle CRLF
      if (ch === '\r' && next === '\n') i++;
      pushField();
      pushRow();
      continue;
    }

    field += ch;
  }

  // Flush the last field/row
  pushField();
  pushRow();

  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim());
  const dataRows = rows.slice(1);

  return dataRows.map((r) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]!] = (r[i] ?? '').trim();
    }
    return obj;
  });
}

function extractRowsForType(parsed: unknown, type: MasterDataType): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    // Common patterns:
    // - { customers: [...] }
    // - { data: [...] }
    // - { items: [...] }
    if (Array.isArray(obj[type])) return obj[type] as unknown[];
    if (Array.isArray(obj.data)) return obj.data as unknown[];
    if (Array.isArray(obj.items)) return obj.items as unknown[];
    // If the JSON is { "row": {..}, ... } we can't reliably convert, so refuse.
  }
  return null;
}

export function parseUploadedMasterFile(text: string, type: MasterDataType): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Try JSON first.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const rows = extractRowsForType(parsed, type);
      if (rows == null) {
        throw new Error(`JSON does not contain an array for "${type}" (expected ${type}[] or data[]).`);
      }
      return rows.map((r) => {
        if (r && typeof r === 'object' && !Array.isArray(r)) return r as Record<string, unknown>;
        return { value: r } as Record<string, unknown>;
      });
    } catch (err) {
      // Fall through to CSV parsing below.
      systemLogger.debug('Master data file parsed as JSON failed; trying CSV', {
        type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // CSV fallback
  const delimiter = detectDelimiter(text);
  return parseCsv(text, delimiter);
}

function onlyDefinedNonEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

type SqlLiteral = { __sql: string };
const rawSql = (sql: string): SqlLiteral => ({ __sql: sql });

async function upsertByKey(params: {
  table: string;
  keyField: string;
  rows: Record<string, unknown>[];
  buildInsert: (row: Record<string, unknown>) => { columns: string[]; values: (string | number | null | SqlLiteral)[] };
  buildUpdate: (row: Record<string, unknown>) => { setClause: string; values: (string | number | null)[] };
  required: (row: Record<string, unknown>) => { ok: boolean; message?: string };
}): Promise<Pick<ImportSummary, 'inserted' | 'updated' | 'skipped' | 'errors'>> {
  const { table, keyField, rows, buildInsert, buildUpdate, required } = params;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { rowIndex: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const check = required(row);
    if (!check.ok) {
      skipped++;
      errors.push({ rowIndex: i, message: check.message || `Row ${i} invalid` });
      continue;
    }

    const keyValue = row[keyField];
    const keyValueStr = typeof keyValue === 'string' || typeof keyValue === 'number' ? keyValue : null;
    if (keyValueStr === null) {
      skipped++;
      errors.push({ rowIndex: i, message: `Missing key field "${keyField}"` });
      continue;
    }

    const exists = await dbService.query<{ ok: number }>(
      `SELECT 1 as ok FROM \`${table}\` WHERE \`${keyField}\` = ? LIMIT 1`,
      [keyValueStr]
    );

    if (Array.isArray(exists.data) && exists.data.length > 0) {
      const { setClause, values } = buildUpdate(row);
      if (!setClause) {
        skipped++;
        continue;
      }
      await dbService.query(`UPDATE \`${table}\` SET ${setClause} WHERE \`${keyField}\` = ?`, [...values, keyValueStr]);
      updated++;
    } else {
      const { columns, values } = buildInsert(row);
      if (columns.length === 0) {
        skipped++;
        errors.push({ rowIndex: i, message: `No insert columns for row ${i}` });
        continue;
      }

      const sqlValues = columns
        .map((_, idx) => {
          const v = values[idx] as string | number | null | SqlLiteral | undefined;
          if (v && typeof v === 'object' && '__sql' in v) return (v as SqlLiteral).__sql;
          return '?';
        })
        .join(', ');

      const paramsValues = values.filter((v) => !(v && typeof v === 'object' && '__sql' in v)) as (string | number | null)[];
      await dbService.query(
        `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES (${sqlValues})`,
        paramsValues
      );
      inserted++;
    }
  }

  return { inserted, updated, skipped, errors };
}

export async function exportMasterData(type: MasterDataType): Promise<Record<string, unknown>[]> {
  switch (type) {
    case 'customers': {
      const res = await dbService.query(
        `SELECT 
          cust_code,
          name,
          attn_1,
          attn_2,
          delivery_addr,
          phone_1,
          phone_2,
          fax_1,
          fax_2,
          pm_code,
          pt_code,
          status,
          district_code,
          from_time,
          to_time,
          delivery_remark,
          remark,
          statement_remark,
          email_1,
          email_2
        FROM t_customers
        ORDER BY cust_code`
      );
      return res.data as unknown as Record<string, unknown>[];
    }
    case 'suppliers': {
      const res = await dbService.query(
        `SELECT 
          supp_code,
          name,
          mail_addr,
          attn_1,
          phone_1,
          fax_1,
          email_1,
          pm_code,
          pt_code,
          remark,
          status
        FROM t_suppliers
        ORDER BY supp_code`
      );
      return res.data as unknown as Record<string, unknown>[];
    }
    case 'districts': {
      const res = await dbService.query(
        `SELECT district_code, district_eng, district_chi, region FROM t_district ORDER BY district_code`
      );
      return res.data as unknown as Record<string, unknown>[];
    }
    case 'prefixes': {
      const res = await dbService.query(
        `SELECT prefix as prefix_code, \`desc\` as prefix_name, status FROM t_prefix ORDER BY prefix`
      );
      return res.data as unknown as Record<string, unknown>[];
    }
    case 'payment-methods': {
      const res = await dbService.query(
        `SELECT pm_code, payment_method FROM t_payment_method ORDER BY pm_code`
      );
      return res.data as unknown as Record<string, unknown>[];
    }
    case 'payment-terms': {
      const res = await dbService.query(
        `SELECT pt_code, terms FROM t_payment_term ORDER BY pt_code`
      );
      return res.data as unknown as Record<string, unknown>[];
    }
    default:
      return [];
  }
}

export async function importMasterData(params: {
  type: MasterDataType;
  mode: ImportMode;
  rows: Record<string, unknown>[];
  user: { uid: number; username: string };
  ipAddress?: string;
}): Promise<ImportSummary> {
  const { type, mode, rows, user, ipAddress } = params;

  const totalRows = rows.length;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: { rowIndex: number; message: string }[] = [];

  // Normalize & merge each entity (insert or update by key).
  switch (type) {
    case 'customers': {
      const normalized = rows.map((r) => {
        const cust_code = toTrimmedString(r.cust_code ?? r.customer_code);
        const name = toTrimmedString(r.name ?? r.customer_name);
        const phone_1 = toTrimmedString(r.phone_1 ?? r.phone);
        return onlyDefinedNonEmpty({
          cust_code,
          name,
          attn_1: toTrimmedString(r.attn_1 ?? r.attention_1),
          attn_2: toTrimmedString(r.attn_2 ?? r.attention_2),
          delivery_addr: toTrimmedString(r.delivery_addr ?? r.delivery_address),
          phone_1,
          phone_2: toTrimmedString(r.phone_2),
          fax_1: toTrimmedString(r.fax_1),
          fax_2: toTrimmedString(r.fax_2),
          pm_code: toTrimmedString(r.pm_code),
          pt_code: toTrimmedString(r.pt_code),
          status: toTrimmedString(r.status) ? parseStatusActive(r.status) : 'Active',
          district_code: toTrimmedString(r.district_code),
          from_time: toTrimmedString(r.from_time),
          to_time: toTrimmedString(r.to_time),
          delivery_remark: toTrimmedString(r.delivery_remark),
          remark: toTrimmedString(r.remark),
          statement_remark: toTrimmedString(r.statement_remark),
          email_1: toTrimmedString(r.email_1),
          email_2: toTrimmedString(r.email_2),
        });
      });

      const summary = await upsertByKey({
        table: 't_customers',
        keyField: 'cust_code',
        rows: normalized,
        required: (row) => {
          if (!toTrimmedString(row.cust_code)) return { ok: false, message: 'cust_code is required' };
          if (!toTrimmedString(row.name)) return { ok: false, message: 'name is required' };
          if (!toTrimmedString(row.phone_1)) return { ok: false, message: 'phone_1 is required' };
          return { ok: true };
        },
        buildInsert: (row) => {
          // Use only columns we recognize.
          const allowed = [
            'cust_code',
            'name',
            'attn_1',
            'attn_2',
            'delivery_addr',
            'phone_1',
            'phone_2',
            'fax_1',
            'fax_2',
            'pm_code',
            'pt_code',
            'status',
            'district_code',
            'from_time',
            'to_time',
            'delivery_remark',
            'remark',
            'statement_remark',
            'email_1',
            'email_2',
          ] as const;
          const columns: string[] = [];
          const values: (string | number | null | SqlLiteral)[] = [];

          for (const col of allowed) {
            const v = row[col];
            if (v === undefined) continue;
            columns.push(col);
            values.push(typeof v === 'string' || typeof v === 'number' ? v : String(v));
          }

          // Ensure timestamps
          columns.push('create_date');
          columns.push('modify_date');
          values.push(rawSql('CURRENT_TIMESTAMP()'));
          values.push(rawSql('CURRENT_TIMESTAMP()'));

          return { columns, values };
        },
        buildUpdate: (row) => {
          const allowed = [
            'name',
            'attn_1',
            'attn_2',
            'delivery_addr',
            'phone_1',
            'phone_2',
            'fax_1',
            'fax_2',
            'pm_code',
            'pt_code',
            'status',
            'district_code',
            'from_time',
            'to_time',
            'delivery_remark',
            'remark',
            'statement_remark',
            'email_1',
            'email_2',
          ] as const;

          const sets: string[] = [];
          const values: (string | number | null)[] = [];

          for (const col of allowed) {
            const v = row[col];
            if (v === undefined) continue;
            sets.push(`\`${col}\` = ?`);
            values.push(typeof v === 'string' || typeof v === 'number' ? v : String(v));
          }
          // Always update modify_date
          sets.push('modify_date = CURRENT_TIMESTAMP()');
          return { setClause: sets.join(', '), values };
        },
      });

      inserted = summary.inserted;
      updated = summary.updated;
      skipped = summary.skipped;
      errors.push(...summary.errors);
      break;
    }
    case 'suppliers': {
      const normalized = rows.map((r) => {
        const supp_code = toTrimmedString(r.supp_code ?? r.supplier_code);
        const name = toTrimmedString(r.name ?? r.supplier_name);
        const phone_1 = toTrimmedString(r.phone_1 ?? r.phone);
        return onlyDefinedNonEmpty({
          supp_code,
          name,
          mail_addr: toTrimmedString(r.mail_addr ?? r.mail_address ?? r.address),
          attn_1: toTrimmedString(r.attn_1 ?? r.contact_person),
          phone_1,
          fax_1: toTrimmedString(r.fax_1),
          email_1: toTrimmedString(r.email_1),
          pm_code: toTrimmedString(r.pm_code),
          pt_code: toTrimmedString(r.pt_code),
          remark: toTrimmedString(r.remark),
          status: toTrimmedString(r.status) ? parseStatusActive(r.status) : 'Active',
        });
      });

      const summary = await upsertByKey({
        table: 't_suppliers',
        keyField: 'supp_code',
        rows: normalized,
        required: (row) => {
          if (!toTrimmedString(row.supp_code)) return { ok: false, message: 'supp_code is required' };
          if (!toTrimmedString(row.name)) return { ok: false, message: 'name is required' };
          if (!toTrimmedString(row.phone_1)) return { ok: false, message: 'phone_1 is required' };
          return { ok: true };
        },
        buildInsert: (row) => {
          const allowed = [
            'supp_code',
            'name',
            'mail_addr',
            'attn_1',
            'phone_1',
            'fax_1',
            'email_1',
            'pm_code',
            'pt_code',
            'remark',
            'status',
          ] as const;
          const columns: string[] = [];
          const values: (string | number | null | SqlLiteral)[] = [];
          for (const col of allowed) {
            const v = row[col];
            if (v === undefined) continue;
            columns.push(col);
            values.push(typeof v === 'string' || typeof v === 'number' ? v : String(v));
          }

          columns.push('create_date');
          columns.push('modify_date');
          values.push(rawSql('NOW()'));
          values.push(rawSql('NOW()'));
          return { columns, values };
        },
        buildUpdate: (row) => {
          const allowed = [
            'name',
            'mail_addr',
            'attn_1',
            'phone_1',
            'fax_1',
            'email_1',
            'pm_code',
            'pt_code',
            'remark',
            'status',
          ] as const;

          const sets: string[] = [];
          const values: (string | number | null)[] = [];
          for (const col of allowed) {
            const v = row[col];
            if (v === undefined) continue;
            sets.push(`\`${col}\` = ?`);
            values.push(typeof v === 'string' || typeof v === 'number' ? v : String(v));
          }
          sets.push('modify_date = NOW()');
          return { setClause: sets.join(', '), values };
        },
      });

      inserted = summary.inserted;
      updated = summary.updated;
      skipped = summary.skipped;
      errors.push(...summary.errors);
      break;
    }
    case 'districts': {
      const normalized = rows.map((r) => {
        const district_code = toTrimmedString(r.district_code);
        return onlyDefinedNonEmpty({
          district_code,
          district_eng: toTrimmedString(r.district_eng),
          district_chi: toTrimmedString(r.district_chi),
          region: toTrimmedString(r.region) || 'HK',
        });
      });

      const summary = await upsertByKey({
        table: 't_district',
        keyField: 'district_code',
        rows: normalized,
        required: (row) => {
          if (!toTrimmedString(row.district_code)) return { ok: false, message: 'district_code is required' };
          if (!toTrimmedString(row.district_eng)) return { ok: false, message: 'district_eng is required' };
          if (!toTrimmedString(row.district_chi)) return { ok: false, message: 'district_chi is required' };
          return { ok: true };
        },
        buildInsert: (row) => {
          const columns = ['district_code', 'district_eng', 'district_chi', 'region'];
          const values = [
            String(row.district_code),
            String(row.district_eng ?? ''),
            String(row.district_chi ?? ''),
            String(row.region ?? 'HK'),
          ];
          return { columns, values };
        },
        buildUpdate: (row) => {
          const sets: string[] = [];
          const values: (string | number | null)[] = [];

          if (row.district_eng !== undefined) {
            sets.push('district_eng = ?');
            values.push(String(row.district_eng));
          }
          if (row.district_chi !== undefined) {
            sets.push('district_chi = ?');
            values.push(String(row.district_chi));
          }
          if (row.region !== undefined) {
            sets.push('region = ?');
            values.push(String(row.region));
          }

          return { setClause: sets.join(', '), values };
        },
      });

      inserted = summary.inserted;
      updated = summary.updated;
      skipped = summary.skipped;
      errors.push(...summary.errors);
      break;
    }
    case 'prefixes': {
      const normalized = rows.map((r) => {
        const prefix_code = toTrimmedString(r.prefix_code ?? r.prefix);
        const prefix_name = toTrimmedString(r.prefix_name ?? r.desc ?? r.description);
        return onlyDefinedNonEmpty({
          prefix_code,
          prefix_name,
          status: r.status ?? r.isActive ?? r.active,
          prefix: prefix_code, // alias for key field access
        });
      });

      const summary = await upsertByKey({
        table: 't_prefix',
        keyField: 'prefix',
        rows: normalized.map((r) => ({ ...r, prefix: r.prefix_code })),
        required: (row) => {
          if (!toTrimmedString(row.prefix)) return { ok: false, message: 'prefix_code is required' };
          if (!toTrimmedString(row.prefix_name)) return { ok: false, message: 'prefix_name is required' };
          return { ok: true };
        },
        buildInsert: (row) => {
          const prefix = String(row.prefix);
          const prefix_name = String(row.prefix_name);
          const status = parseBoolToStatus0or1(row.status);
          return {
            columns: ['prefix', 'desc', 'status'],
            values: [prefix, prefix_name, status],
          };
        },
        buildUpdate: (row) => {
          const sets: string[] = [];
          const values: (string | number | null)[] = [];
          sets.push('`desc` = ?');
          values.push(String(row.prefix_name ?? ''));
          sets.push('status = ?');
          values.push(parseBoolToStatus0or1(row.status));
          return { setClause: sets.join(', '), values };
        },
      });

      inserted = summary.inserted;
      updated = summary.updated;
      skipped = summary.skipped;
      errors.push(...summary.errors);
      break;
    }
    case 'payment-methods': {
      const normalized = rows.map((r) =>
        onlyDefinedNonEmpty({
          pm_code: toTrimmedString(r.pm_code),
          payment_method: toTrimmedString(r.payment_method ?? r.description ?? r.name),
        })
      );

      const summary = await upsertByKey({
        table: 't_payment_method',
        keyField: 'pm_code',
        rows: normalized,
        required: (row) => {
          if (!toTrimmedString(row.pm_code)) return { ok: false, message: 'pm_code is required' };
          if (!toTrimmedString(row.payment_method)) return { ok: false, message: 'payment_method is required' };
          return { ok: true };
        },
        buildInsert: (row) => ({
          columns: ['pm_code', 'payment_method'],
          values: [String(row.pm_code), String(row.payment_method)],
        }),
        buildUpdate: (row) => {
          return {
            setClause: '`payment_method` = ?, modify_date = CURRENT_TIMESTAMP()',
            values: [String(row.payment_method)],
          };
        },
      });

      inserted = summary.inserted;
      updated = summary.updated;
      skipped = summary.skipped;
      errors.push(...summary.errors);
      break;
    }
    case 'payment-terms': {
      const normalized = rows.map((r) =>
        onlyDefinedNonEmpty({
          pt_code: toTrimmedString(r.pt_code),
          terms: toTrimmedString(r.terms ?? r.payment_term),
        })
      );

      const summary = await upsertByKey({
        table: 't_payment_term',
        keyField: 'pt_code',
        rows: normalized,
        required: (row) => {
          if (!toTrimmedString(row.pt_code)) return { ok: false, message: 'pt_code is required' };
          if (!toTrimmedString(row.terms)) return { ok: false, message: 'terms is required' };
          return { ok: true };
        },
        buildInsert: (row) => ({
          columns: ['pt_code', 'terms', 'create_date', 'modify_date'],
          values: [String(row.pt_code), String(row.terms), rawSql('NOW()'), rawSql('NOW()')],
        }),
        buildUpdate: (row) => {
          return {
            setClause: '`terms` = ?, modify_date = NOW()',
            values: [String(row.terms)],
          };
        },
      });

      inserted = summary.inserted;
      updated = summary.updated;
      skipped = summary.skipped;
      errors.push(...summary.errors);
      break;
    }
    default:
      break;
  }

  userActionLogger.import(String(user.uid), user.username, `master-data:${type}`, mode, totalRows, ipAddress);
  systemLogger.info(`Master data import completed`, { type, mode, inserted, updated, skipped, totalRows });

  return { type, mode, totalRows, inserted, updated, skipped, errors };
}

