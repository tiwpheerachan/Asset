import 'server-only';
import { pool } from './db';
import { FA_SCHEMA_SQL } from './fa-schema';
import type { State } from './store-types';
import {
  ACCOUNTS as _ACCOUNTS,
  BRANCHES, CATEGORIES, COMPANIES, COST_CENTERS, DEPARTMENTS,
  LOCATIONS, OA_INTEGRATION, POLICIES, RUNNING_NUMBERS, USERS,
} from '@/data/masters';
import { buildSeedAssets, buildSeedDocuments, SEED_AUDIT, SEED_OA, SEED_RUNS } from '@/data/seed';

void _ACCOUNTS;
export const STATE_VERSION = 3;

// เผื่อไว้ต่ำกว่าเพดาน parameter ของ Postgres (65535)
const MAX_PARAMS = 50000;

/** รูป State ที่เก็บลง DB (ไม่รวม session — session อยู่ที่ browser) */
type PersistState = Omit<State, 'session'>;

/** collection → (table, id-getter, promoted columns) */
type Coll = {
  key: keyof PersistState;
  table: string;
  id: (r: Record<string, unknown>) => string;
  cols?: { name: string; get: (r: Record<string, unknown>) => unknown }[];
};

type CollKey = keyof PersistState;

const COLLECTIONS: Coll[] = [
  { key: 'companies', table: 'fa.companies', id: (r) => r.id as string },
  { key: 'branches', table: 'fa.branches', id: (r) => r.id as string },
  { key: 'departments', table: 'fa.departments', id: (r) => r.id as string },
  { key: 'costCenters', table: 'fa.cost_centers', id: (r) => r.id as string },
  { key: 'locations', table: 'fa.locations', id: (r) => r.id as string },
  { key: 'categories', table: 'fa.categories', id: (r) => r.id as string },
  { key: 'policies', table: 'fa.policies', id: (r) => r.id as string },
  { key: 'users', table: 'fa.users', id: (r) => r.id as string },
  { key: 'running', table: 'fa.running_numbers', id: (r) => r.companyId as string },
  {
    key: 'assets', table: 'fa.assets', id: (r) => r.id as string,
    cols: [
      { name: 'code', get: (r) => r.code },
      { name: 'status', get: (r) => r.status },
    ],
  },
  {
    key: 'oa', table: 'fa.oa_records', id: (r) => r.id as string,
    cols: [
      { name: 'doc_no', get: (r) => r.docNo ?? null },
      { name: 'status', get: (r) => r.status },
    ],
  },
  { key: 'documents', table: 'fa.documents', id: (r) => r.id as string },
  { key: 'audit', table: 'fa.audit_logs', id: (r) => r.id as string },
  { key: 'runs', table: 'fa.dep_runs', id: (r) => r.id as string },
  { key: 'movements', table: 'fa.asset_movements', id: (r) => r.id as string },
  { key: 'disposals', table: 'fa.asset_disposals', id: (r) => r.id as string },
];

export function seedState(): PersistState {
  const assets = buildSeedAssets();
  return {
    version: STATE_VERSION,
    assets,
    oa: SEED_OA,
    documents: buildSeedDocuments(assets),
    audit: SEED_AUDIT,
    runs: SEED_RUNS,
    movements: [],
    disposals: [],
    policies: POLICIES,
    categories: CATEGORIES,
    companies: COMPANIES,
    branches: BRANCHES,
    departments: DEPARTMENTS,
    costCenters: COST_CENTERS,
    locations: LOCATIONS,
    running: RUNNING_NUMBERS,
    oaIntegration: OA_INTEGRATION,
    users: USERS,
  };
}

async function isSeeded(): Promise<boolean> {
  const r = await pool().query("SELECT 1 FROM fa.app_state WHERE key = 'seeded'");
  return (r.rowCount ?? 0) > 0;
}

/** สร้าง schema `fa` + ตารางทั้งหมดถ้ายังไม่มี (idempotent) — ทำให้ deploy บน DB เปล่าได้เลย
 *  รันครั้งเดียวต่อ process (cache ด้วย promise) */
let schemaReady: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool()
      .query(FA_SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        schemaReady = null; // ให้ลองใหม่ได้ครั้งหน้า
        throw e;
      });
  }
  return schemaReady;
}

/** อ่าน State ทั้งหมดจาก fa tables */
export async function getState(): Promise<PersistState> {
  await ensureSchema();
  if (!(await isSeeded())) {
    const seed = seedState();
    await saveState(seed);
    await pool().query("INSERT INTO fa.app_state(key,data) VALUES('seeded','true') ON CONFLICT (key) DO NOTHING");
    return seed;
  }
  const out = {} as Record<string, unknown>;
  const rev: Record<string, Record<string, number>> = {};
  for (const c of COLLECTIONS) {
    const r = await pool().query(`SELECT id, data, version FROM ${c.table}`);
    out[c.key] = r.rows.map((row) => row.data);
    const m: Record<string, number> = {};
    for (const row of r.rows) m[row.id as string] = (row.version as number) ?? 0;
    rev[c.key] = m;
  }
  const meta = await pool().query("SELECT key, data FROM fa.app_state WHERE key IN ('oaIntegration','version')");
  const metaMap = new Map(meta.rows.map((m) => [m.key, m.data]));
  out.oaIntegration = metaMap.get('oaIntegration') ?? OA_INTEGRATION;
  out.version = metaMap.get('version') ?? STATE_VERSION;
  // เวอร์ชันราย record ให้ client เก็บไว้เทียบตอนเซฟ (optimistic lock) — ไม่ใช่ field ของ State
  (out as Record<string, unknown>)._rev = rev;
  return out as unknown as PersistState;
}

/** เขียน State ทั้งก้อน (replace) — ทำใน transaction เดียว
 *  ใช้ bulk INSERT (multi-row ต่อคำสั่ง) แทนการ insert ทีละแถว เพื่อให้บันทึกเร็วขึ้นมาก
 *  (ลด round-trip จากหลายร้อยครั้งเหลือหลักสิบ — แก้อาการ “กดตรวจสอบแล้วช้า”) */
export async function saveState(state: PersistState): Promise<void> {
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    for (const c of COLLECTIONS) {
      const rows = (state[c.key] as unknown as Record<string, unknown>[]) ?? [];
      await client.query(`DELETE FROM ${c.table}`);
      if (!rows.length) continue;
      const extraCols = c.cols ?? [];
      const colCount = 2 + extraCols.length; // id, data, ...promoted columns
      const colNames = ['id', 'data', ...extraCols.map((x) => x.name)].join(', ');
      const chunkSize = Math.max(1, Math.floor(MAX_PARAMS / colCount));
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const values: unknown[] = [];
        const tuples = chunk.map((row, j) => {
          const base = j * colCount;
          values.push(c.id(row), JSON.stringify(row), ...extraCols.map((x) => x.get(row)));
          const ph = Array.from({ length: colCount }, (_, k) => `$${base + k + 1}`).join(', ');
          return `(${ph})`;
        });
        await client.query(`INSERT INTO ${c.table}(${colNames}) VALUES ${tuples.join(', ')}`, values);
      }
    }
    await client.query(
      "INSERT INTO fa.app_state(key,data,updated_at) VALUES('oaIntegration',$1,now()) ON CONFLICT (key) DO UPDATE SET data=excluded.data, updated_at=now()",
      [JSON.stringify(state.oaIntegration)],
    );
    await client.query(
      "INSERT INTO fa.app_state(key,data,updated_at) VALUES('version',$1,now()) ON CONFLICT (key) DO UPDATE SET data=excluded.data, updated_at=now()",
      [JSON.stringify(state.version ?? STATE_VERSION)],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

const COLL_BY_KEY = new Map<CollKey, Coll>(COLLECTIONS.map((c) => [c.key, c]));

type PgClient = { query: (text: string, values?: unknown[]) => Promise<{ rowCount: number | null }> };

/** แถวที่ upsert พร้อม base = เวอร์ชันที่ client โหลดมา (undefined/null = แถวใหม่) */
type Upsert = { data: Record<string, unknown>; base?: number | null };

/** ความขัดแย้งจาก optimistic lock — แถวถูกคนอื่นแก้/สร้างไปก่อนแล้ว */
export class ConflictError extends Error {
  code = 'FA_CONFLICT' as const;
  conflicts: { collection: string; id: string }[];
  constructor(conflicts: { collection: string; id: string }[]) {
    super(`version conflict on ${conflicts.length} row(s)`);
    this.name = 'ConflictError';
    this.conflicts = conflicts;
  }
}

/**
 * เขียนแถวเดียวแบบมีเงื่อนไขเวอร์ชัน:
 *  - แถวใหม่ (base ว่าง) → INSERT version=0; ถ้า id ชนของเดิม = conflict
 *  - แถวเดิม (base = n)  → UPDATE ... version=version+1 WHERE id=? AND version=n; ถ้าไม่โดนแถว = conflict
 * คืน true ถ้าสำเร็จ, false ถ้า conflict
 */
async function writeRow(client: PgClient, c: Coll, u: Upsert): Promise<boolean> {
  const id = c.id(u.data);
  const extraCols = c.cols ?? [];
  const dataJson = JSON.stringify(u.data);
  if (u.base === undefined || u.base === null) {
    const colNames = ['id', 'data', 'version', ...extraCols.map((x) => x.name)];
    const vals: unknown[] = [id, dataJson, 0, ...extraCols.map((x) => x.get(u.data))];
    const ph = colNames.map((_, k) => `$${k + 1}`).join(', ');
    const r = await client.query(
      `INSERT INTO ${c.table}(${colNames.join(', ')}) VALUES (${ph}) ON CONFLICT (id) DO NOTHING`,
      vals,
    );
    return (r.rowCount ?? 0) > 0;
  }
  const sets = ['data = $2', 'version = version + 1', 'updated_at = now()', ...extraCols.map((x, i) => `${x.name} = $${4 + i}`)];
  const vals: unknown[] = [id, dataJson, u.base, ...extraCols.map((x) => x.get(u.data))];
  const r = await client.query(
    `UPDATE ${c.table} SET ${sets.join(', ')} WHERE id = $1 AND version = $3`,
    vals,
  );
  return (r.rowCount ?? 0) > 0;
}

/** รูป payload ของการบันทึกแบบส่วนต่าง (diff) — เขียนเฉพาะแถวที่เปลี่ยน/ลบ ไม่แตะแถวอื่น */
export type StateDiff = {
  changes?: Partial<Record<CollKey, { upserts?: Upsert[]; deletes?: string[] }>>;
  oaIntegration?: unknown;
  version?: unknown;
};

/**
 * บันทึกแบบส่วนต่าง: upsert เฉพาะแถวที่เปลี่ยน + ลบเฉพาะ id ที่ถูกลบ ในทรานแซกชันเดียว
 * ไม่มีการ DELETE ทั้งตาราง + ตรวจเวอร์ชันราย record → กันทั้ง data loss และการแก้แถวเดียวกันทับกัน
 * ถ้าเจอ conflict จะ ROLLBACK ทั้งก้อนแล้วโยน ConflictError (ไม่เขียนบางส่วน)
 */
export async function saveStateDiff(diff: StateDiff): Promise<void> {
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const conflicts: { collection: string; id: string }[] = [];
    for (const [key, change] of Object.entries(diff.changes ?? {})) {
      const c = COLL_BY_KEY.get(key as CollKey);
      if (!c || !change) continue;
      for (const u of change.upserts ?? []) {
        const ok = await writeRow(client, c, u);
        if (!ok) conflicts.push({ collection: key, id: c.id(u.data) });
      }
      if (change.deletes?.length) {
        await client.query(`DELETE FROM ${c.table} WHERE id = ANY($1)`, [change.deletes]);
      }
    }
    if (conflicts.length) throw new ConflictError(conflicts);
    if (diff.oaIntegration !== undefined) {
      await client.query(
        "INSERT INTO fa.app_state(key,data,updated_at) VALUES('oaIntegration',$1,now()) ON CONFLICT (key) DO UPDATE SET data=excluded.data, updated_at=now()",
        [JSON.stringify(diff.oaIntegration)],
      );
    }
    if (diff.version !== undefined) {
      await client.query(
        "INSERT INTO fa.app_state(key,data,updated_at) VALUES('version',$1,now()) ON CONFLICT (key) DO UPDATE SET data=excluded.data, updated_at=now()",
        [JSON.stringify(diff.version)],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
