// Export = one JSON {app, schema, exportedAt, tables}. Import validates the version and merges by key (idempotent).
import { SCHEMA_VERSION, TABLES, type MentorDB, type TableName } from './db';

export interface ExportFile {
  app: 'mentor';
  schema: number;
  exportedAt: number;
  tables: Record<TableName, unknown[]>;
}

export async function exportAll(db: MentorDB, opts: { includeSecrets?: boolean } = {}): Promise<ExportFile> {
  const tables = {} as Record<TableName, unknown[]>;
  for (const t of TABLES) tables[t] = await db.table(t).toArray();
  if (!opts.includeSecrets) {
    // AI keys never leave the device unless the user ticks the box (docs/backend/09 §4).
    tables.kv = (tables.kv as { key: string; value: Record<string, unknown> }[]).map((r) =>
      r.key === 'settings.v1' && r.value && typeof r.value === 'object'
        ? { ...r, value: { ...r.value, groqKey: '' } }
        : r,
    );
  }
  return { app: 'mentor', schema: SCHEMA_VERSION, exportedAt: Date.now(), tables };
}

export async function importAll(db: MentorDB, file: unknown): Promise<{ rows: number }> {
  const f = file as Partial<ExportFile>;
  if (f?.app !== 'mentor') throw new Error('Not a Mentor export file.');
  if (f.schema !== SCHEMA_VERSION)
    throw new Error(`Export is schema ${f.schema}; this app reads schema ${SCHEMA_VERSION}.`);
  let rows = 0;
  await db.transaction(
    'rw',
    TABLES.map((t) => db.table(t)),
    async () => {
      for (const t of TABLES) {
        const list = (f.tables?.[t] ?? []) as unknown[];
        await db.table(t).bulkPut(list);
        rows += list.length;
      }
    },
  );
  return { rows };
}

export async function deleteAll(db: MentorDB) {
  db.close();
  await db.delete();
  try {
    localStorage.clear();
  } catch {
    /* storage blocked */
  }
  if ('caches' in globalThis) for (const k of await caches.keys()) await caches.delete(k);
}
