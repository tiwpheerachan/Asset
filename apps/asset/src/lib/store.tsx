'use client';

/**
 * Client-side data store for the prototype.
 * Mirrors the database modules in db/schema.sql. In production, replace the
 * action implementations with Server Actions / API routes backed by Postgres
 * (Supabase) — component code only depends on this hook's interface.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AppUser,
  Asset,
  AssetDocument,
  AssetStatus,
  AuditLog,
  AuditSource,
  Branch,
  Category,
  Company,
  CostCenter,
  Department,
  DepPolicy,
  DepRun,
  DisposalType,
  Location,
  MaintenanceType,
  OAIntegration,
  OARecord,
  OAStatus,
  Role,
  RunningNumberConfig,
  RunStatus,
} from './types';
import {
  ACCOUNTS,
  BRANCHES,
  CATEGORIES,
  COMPANIES,
  COST_CENTERS,
  DEPARTMENTS,
  LOCATIONS,
  OA_INTEGRATION,
  POLICIES,
  RUNNING_NUMBERS,
  USERS,
} from '@/data/masters';
import { buildSeedAssets, buildSeedDocuments, SEED_AUDIT, SEED_OA, SEED_RUNS } from '@/data/seed';
import { can, type Permission } from './rbac';

export const CURRENT_PERIOD = '2026-09';
export const TODAY = '2026-10-01';

export type { State } from './store-types';
import type { State } from './store-types';

const STATE_VERSION = 3;
const KEY = 'fa.session.v3'; // เก็บเฉพาะ session ที่ browser — ข้อมูลหลักอยู่ Postgres (schema fa)

/** คอลเลกชันที่ persist ลง DB + วิธีหา id ของแต่ละแถว (ต้องตรงกับ COLLECTIONS ฝั่ง fa-repo.ts) */
type PersistKey =
  | 'companies' | 'branches' | 'departments' | 'costCenters' | 'locations'
  | 'categories' | 'policies' | 'users' | 'running' | 'assets' | 'oa'
  | 'documents' | 'audit' | 'runs' | 'movements' | 'disposals' | 'maintenance';
const PERSIST_COLLECTIONS: { key: PersistKey; id: (r: Record<string, unknown>) => string }[] = [
  { key: 'companies', id: (r) => r.id as string },
  { key: 'branches', id: (r) => r.id as string },
  { key: 'departments', id: (r) => r.id as string },
  { key: 'costCenters', id: (r) => r.id as string },
  { key: 'locations', id: (r) => r.id as string },
  { key: 'categories', id: (r) => r.id as string },
  { key: 'policies', id: (r) => r.id as string },
  { key: 'users', id: (r) => r.id as string },
  { key: 'running', id: (r) => r.companyId as string },
  { key: 'assets', id: (r) => r.id as string },
  { key: 'oa', id: (r) => r.id as string },
  { key: 'documents', id: (r) => r.id as string },
  { key: 'audit', id: (r) => r.id as string },
  { key: 'runs', id: (r) => r.id as string },
  { key: 'movements', id: (r) => r.id as string },
  { key: 'disposals', id: (r) => r.id as string },
  { key: 'maintenance', id: (r) => r.id as string },
];

const PERSIST_ID: Record<string, (r: Record<string, unknown>) => string> = Object.fromEntries(
  PERSIST_COLLECTIONS.map((c) => [c.key, c.id]),
);

/** เวอร์ชันราย record ที่ server ส่งมากับ GET (ใต้ key `_rev`) */
type RevMap = Record<string, Record<string, number>>;

/** ภาพถ่ายของสิ่งที่อยู่ใน DB (เท่าที่ browser นี้รู้) — ใช้เทียบหา diff + เก็บเวอร์ชันราย record */
type SavedSnapshot = {
  colls: Record<string, Map<string, string>>; // collection → (id → JSON ของแถว)
  revs: Record<string, Map<string, number>>; // collection → (id → version ใน DB)
  oaIntegration: string;
  version: string;
};

function emptySnapshot(): SavedSnapshot {
  return { colls: {}, revs: {}, oaIntegration: '', version: '' };
}

/** สร้าง snapshot จาก state + เวอร์ชันจาก server (ใช้ตอนโหลดเสร็จ/หลัง reconcile) */
function buildSnapshot(state: Partial<Record<string, unknown>>, rev?: RevMap): SavedSnapshot {
  const colls: Record<string, Map<string, string>> = {};
  const revs: Record<string, Map<string, number>> = {};
  for (const { key, id } of PERSIST_COLLECTIONS) {
    const rows = (state[key] as Record<string, unknown>[] | undefined) ?? [];
    const cm = new Map<string, string>();
    const rm = new Map<string, number>();
    for (const r of rows) {
      const rid = id(r);
      cm.set(rid, JSON.stringify(r));
      rm.set(rid, rev?.[key]?.[rid] ?? 0);
    }
    colls[key] = cm;
    revs[key] = rm;
  }
  return {
    colls,
    revs,
    oaIntegration: JSON.stringify(state.oaIntegration ?? null),
    version: JSON.stringify(state.version ?? null),
  };
}

type Upsert = { data: Record<string, unknown>; base: number | null };
type DiffBody = {
  changes: Record<string, { upserts: Upsert[]; deletes: string[] }>;
  oaIntegration?: unknown;
  version?: unknown;
};

/**
 * เทียบ state ปัจจุบันกับ snapshot ล่าสุด → ได้เฉพาะแถวที่เปลี่ยน/ลบ (พร้อม base version) + snapshot ใหม่
 * snapshot ใหม่คำนวณเวอร์ชันที่ "คาดว่าจะเป็น" หลังเซฟ (insert→0, update→base+1) ตรงกับฝั่ง server
 */
function computeDiff(
  state: Partial<Record<string, unknown>>,
  last: SavedSnapshot,
): { body: DiffBody; snapshot: SavedSnapshot; empty: boolean } {
  const changes: DiffBody['changes'] = {};
  const snapColls: Record<string, Map<string, string>> = {};
  const snapRevs: Record<string, Map<string, number>> = {};
  for (const { key, id } of PERSIST_COLLECTIONS) {
    const rows = (state[key] as Record<string, unknown>[] | undefined) ?? [];
    const prevJson = last.colls[key] ?? new Map<string, string>();
    const prevRev = last.revs[key] ?? new Map<string, number>();
    const curJson = new Map<string, string>();
    const curRev = new Map<string, number>();
    const upserts: Upsert[] = [];
    for (const r of rows) {
      const rid = id(r);
      const js = JSON.stringify(r);
      curJson.set(rid, js);
      const base = prevRev.has(rid) ? (prevRev.get(rid) as number) : null;
      if (prevJson.get(rid) !== js) {
        upserts.push({ data: r, base });
        curRev.set(rid, base === null ? 0 : base + 1); // เวอร์ชันที่คาดว่าจะเป็นหลังเซฟ
      } else {
        curRev.set(rid, base ?? 0);
      }
    }
    const deletes: string[] = [];
    for (const rid of prevJson.keys()) if (!curJson.has(rid)) deletes.push(rid);
    if (upserts.length || deletes.length) changes[key] = { upserts, deletes };
    snapColls[key] = curJson;
    snapRevs[key] = curRev;
  }
  const oaStr = JSON.stringify(state.oaIntegration ?? null);
  const verStr = JSON.stringify(state.version ?? null);
  const body: DiffBody = { changes };
  if (oaStr !== last.oaIntegration) body.oaIntegration = state.oaIntegration;
  if (verStr !== last.version) body.version = state.version;
  const empty =
    Object.keys(changes).length === 0 && body.oaIntegration === undefined && body.version === undefined;
  return {
    body,
    snapshot: { colls: snapColls, revs: snapRevs, oaIntegration: oaStr, version: verStr },
    empty,
  };
}

/** รวมข้อมูลจาก server (ล่าสุด) กับการแก้ของเราที่เพิ่งพยายามเซฟ — ใช้ตอนเจอ conflict (409) */
function mergeServerWithAttempt(
  serverState: Record<string, unknown>,
  body: DiffBody,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...serverState };
  for (const [key, change] of Object.entries(body.changes)) {
    const idOf = PERSIST_ID[key];
    if (!idOf) continue;
    const rows = ((merged[key] as Record<string, unknown>[] | undefined) ?? []).slice();
    const map = new Map(rows.map((r) => [idOf(r), r]));
    for (const u of change.upserts) map.set(idOf(u.data), u.data); // การแก้ของเราทับ (ของเราชนะ)
    for (const did of change.deletes) map.delete(did);
    merged[key] = Array.from(map.values());
  }
  if (body.oaIntegration !== undefined) merged.oaIntegration = body.oaIntegration;
  if (body.version !== undefined) merged.version = body.version;
  return merged;
}

function seedState(): State {
  const assets = buildSeedAssets();
  return {
    version: STATE_VERSION,
    session: null,
    assets,
    oa: SEED_OA,
    documents: buildSeedDocuments(assets),
    audit: SEED_AUDIT,
    runs: SEED_RUNS,
    movements: [],
    disposals: [],
    maintenance: [],
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

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const nowIso = () => new Date().toISOString();

type MasterKey = 'companies' | 'branches' | 'departments' | 'costCenters' | 'locations' | 'categories' | 'policies' | 'users';

interface StoreApi {
  state: State;
  ready: boolean;
  role: Role;
  userName: string;
  can: (p: Permission) => boolean;
  accounts: typeof ACCOUNTS;
  signIn: (userId: string) => void;
  signOut: () => void;
  resetDemo: () => void;
  audit: (e: Omit<AuditLog, 'id' | 'at' | 'user' | 'role' | 'source'> & { source?: AuditSource }) => void;
  previewCode: (companyId: string, categoryId?: string, date?: string) => string;
  previewCodes: (companyId: string, categoryId: string, n: number, date?: string) => string[];
  updateAsset: (id: string, patch: Partial<Asset>, reason?: string) => void;
  setAssetStatus: (id: string, status: AssetStatus, reason?: string) => void;
  transferAsset: (id: string, toLocationId: string, reason: string) => void;
  disposeAsset: (id: string, input: { disposalType: DisposalType; proceeds: number; nbvAtDisposal: number }, reason: string) => void;
  addMaintenance: (id: string, input: { type: MaintenanceType; date: string; cost: number; vendor: string; note: string }) => void;
  createAsset: (a: Omit<Asset, 'id' | 'code' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>, reason?: string) => string;
  importAssets: (rows: Asset[]) => number;
  setOAStatus: (id: string, status: OAStatus, extra?: Partial<OARecord>, reason?: string) => void;
  createFromOA: (id: string, opts: { split: boolean; subcategoryId: string }) => string[];
  syncOA: () => Promise<number>;
  syncOnebook: () => Promise<number>;
  addDocument: (d: Omit<AssetDocument, 'id' | 'uploadedAt' | 'uploadedBy'>) => void;
  setRunStatus: (period: string, status: RunStatus, totals?: { assetCount: number; amount: number }) => void;
  createRun: (period: string) => void;
  upsertMaster: <K extends MasterKey>(key: K, item: State[K][number], reason?: string) => void;
  updateRunning: (cfg: RunningNumberConfig) => void;
  updateOAIntegration: (cfg: OAIntegration) => void;
}

const Ctx = createContext<StoreApi | null>(null);

/** ย่อ code หมวด/บริษัทให้เหลือ A-Z 0-9 (เช่น "COM", "SHD") สำหรับใช้เป็นส่วนของรหัสทรัพย์สิน */
function segmentize(code: string | undefined, fallback: string): string {
  const s = (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return s || fallback;
}

/**
 * รหัสทรัพย์สินแบบ COMPANY-CATEGORY-YY-SEQ (เช่น SHD-COM-26-00001)
 * ไม่ฝังสาขาไว้ในรหัส เพราะทรัพย์สินย้ายสาขาได้ (รีวิว §12) — ลำดับแยกตามบริษัท+หมวดหมู่
 */
function formatAssetCode(companyCode: string, catCode: string, date: string, seq: number, digits: number) {
  const yy = (date.split('-')[0] ?? '').slice(2);
  return `${companyCode}-${catCode}-${yy}-${String(seq).padStart(digits, '0')}`;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(seedState);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // บันทึกลง DB แบบ "ส่วนต่าง" (เขียนเฉพาะแถวที่เปลี่ยน/ลบ ไม่แตะแถวอื่น)
  // → ผู้ใช้สองคนเซฟพร้อมกันไม่ทับข้อมูลกัน (เลิกวิธี POST ทั้งก้อน + DELETE ทั้งตาราง)
  const lastSavedRef = useRef<SavedSnapshot>(emptySnapshot());
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);
  const doSave = useCallback(async () => {
    if (savingRef.current) {
      saveAgainRef.current = true; // มีการเปลี่ยนระหว่างกำลังเซฟ — เซฟอีกรอบหลังเสร็จ
      return;
    }
    savingRef.current = true;
    try {
      const { session: _session, ...rest } = stateRef.current;
      void _session;
      const { body, snapshot, empty } = computeDiff(rest as Record<string, unknown>, lastSavedRef.current);
      if (!empty) {
        const res = await fetch('/api/fa/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          lastSavedRef.current = snapshot; // DB ตรงกับที่เราส่งแล้ว
        } else if (res.status === 409) {
          // มีคนอื่นแก้แถวที่เราแตะไปก่อน — ดึงข้อมูลล่าสุด แล้ว merge การแก้ของเราทับ
          // (ตั้ง baseline เป็นเวอร์ชันล่าสุดของ server) จากนั้น effect จะเซฟซ้ำด้วย base ใหม่
          const r2 = await fetch('/api/fa/state', { cache: 'no-store' });
          if (r2.ok) {
            const db = (await r2.json()) as Record<string, unknown>;
            const rev = db._rev as RevMap | undefined;
            delete db._rev;
            lastSavedRef.current = buildSnapshot(db, rev);
            const merged = mergeServerWithAttempt(db, body);
            setState((cur) => ({ ...(merged as unknown as State), session: cur.session }));
          }
        }
      }
    } catch {
      /* จะลองใหม่เมื่อ state เปลี่ยนครั้งถัดไป */
    } finally {
      savingRef.current = false;
      if (saveAgainRef.current) {
        saveAgainRef.current = false;
        void doSave();
      }
    }
  }, []);

  // โหลด: session จาก browser + ข้อมูลหลักจาก Postgres (schema fa, DB เดียวกับ OA)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let session: State['session'] = null;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) session = JSON.parse(raw) as State['session'];
      } catch {
        /* ignore */
      }
      try {
        const res = await fetch('/api/fa/state', { cache: 'no-store' });
        if (res.ok) {
          const db = (await res.json()) as State & { _rev?: RevMap };
          if (!cancelled && db && Array.isArray(db.assets)) {
            const rev = db._rev;
            delete db._rev;
            lastSavedRef.current = buildSnapshot(db as unknown as Record<string, unknown>, rev);
            setState({ ...db, session });
          } else if (!cancelled) {
            setState((s) => ({ ...s, session }));
          }
        } else if (!cancelled) {
          setState((s) => ({ ...s, session }));
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, session }));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // บันทึก: session → browser · ข้อมูลหลัก → Postgres (debounced)
  useEffect(() => {
    if (!ready) return;
    try {
      if (state.session) localStorage.setItem(KEY, JSON.stringify(state.session));
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => {
      void doSave();
    }, 400);
    return () => clearTimeout(t);
  }, [state, ready, doSave]);

  const role: Role = state.session?.role ?? 'AUDITOR';
  const userName = state.session?.name ?? 'Guest';

  const mkAudit = useCallback(
    (e: Omit<AuditLog, 'id' | 'at' | 'user' | 'role' | 'source'> & { source?: AuditSource }): AuditLog => ({
      id: uid('AU'),
      at: nowIso(),
      user: stateRef.current.session?.name ?? 'System',
      role: stateRef.current.session?.role ?? 'SYSTEM',
      source: e.source ?? 'UI',
      ...e,
    }),
    [],
  );

  const api = useMemo<StoreApi>(() => {
    // Synchronous commit: compute from the latest state, so callers can read results immediately
    const commit = (fn: (s: State) => State) => {
      const next = fn(stateRef.current);
      if (next === stateRef.current) return;
      stateRef.current = next;
      setState(next);
    };
    const audit: StoreApi['audit'] = (e) => commit((s) => ({ ...s, audit: [mkAudit(e), ...s.audit] }));

    const codeParts = (s: State, companyId: string, categoryId: string) => {
      const cfg = s.running.find((r) => r.companyId === companyId) ?? s.running[0];
      const companyCode = segmentize(s.companies.find((c) => c.id === companyId)?.code ?? cfg?.prefix, 'CO');
      const catCode = segmentize(s.categories.find((c) => c.id === categoryId)?.code, 'GEN');
      const start = cfg?.seqByCategory?.[categoryId] ?? 1;
      return { cfg, companyCode, catCode, start };
    };

    const nextCodes = (
      s: State,
      companyId: string,
      categoryId: string,
      n: number,
      date = TODAY,
    ): { codes: string[]; running: RunningNumberConfig[] } => {
      const { cfg, companyCode, catCode, start } = codeParts(s, companyId, categoryId);
      const codes = Array.from({ length: n }, (_, i) =>
        formatAssetCode(companyCode, catCode, date, start + i, cfg?.seqDigits ?? 5),
      );
      const running = s.running.map((r) =>
        r === cfg ? { ...r, seqByCategory: { ...(r.seqByCategory ?? {}), [categoryId]: start + n } } : r,
      );
      return { codes, running };
    };

    return {
      state,
      ready,
      role,
      userName,
      accounts: ACCOUNTS,
      can: (p) => can(role, p),
      signIn: (userId) =>
        commit((s) => {
          const u = s.users.find((x) => x.id === userId)!;
          return { ...s, session: { userId: u.id, role: u.role, name: u.name } };
        }),
      signOut: () => commit((s) => ({ ...s, session: null })),
      resetDemo: () => {
        const fresh = seedState();
        commit((s) => ({ ...fresh, session: s.session }));
      },
      audit,
      previewCode: (companyId, categoryId, date = TODAY) => {
        const { cfg, companyCode, catCode, start } = codeParts(state, companyId, categoryId ?? '');
        return formatAssetCode(companyCode, catCode, date, start, cfg?.seqDigits ?? 5);
      },
      previewCodes: (companyId, categoryId, n, date = TODAY) => {
        const { cfg, companyCode, catCode, start } = codeParts(state, companyId, categoryId);
        return Array.from({ length: n }, (_, i) =>
          formatAssetCode(companyCode, catCode, date, start + i, cfg?.seqDigits ?? 5),
        );
      },
      updateAsset: (id, patch, reason) =>
        commit((s) => {
          const a = s.assets.find((x) => x.id === id);
          if (!a) return s;
          const logs: AuditLog[] = [];
          for (const [k, v] of Object.entries(patch)) {
            const old = (a as unknown as Record<string, unknown>)[k];
            if (JSON.stringify(old) !== JSON.stringify(v))
              logs.push(mkAudit({ action: 'UPDATE', assetCode: a.code, entity: 'assets', field: k, oldValue: fmtVal(old), newValue: fmtVal(v), reason }));
          }
          if (!logs.length) return s;
          return {
            ...s,
            assets: s.assets.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: nowIso(), updatedBy: s.session?.name ?? '' } : x)),
            audit: [...logs.reverse(), ...s.audit],
          };
        }),
      setAssetStatus: (id, status, reason) =>
        commit((s) => {
          const a = s.assets.find((x) => x.id === id);
          if (!a) return s;
          return {
            ...s,
            assets: s.assets.map((x) => (x.id === id ? { ...x, status, updatedAt: nowIso(), updatedBy: s.session?.name ?? '' } : x)),
            audit: [mkAudit({ action: 'STATUS_CHANGE', assetCode: a.code, entity: 'assets', field: 'status', oldValue: a.status, newValue: status, reason }), ...s.audit],
          };
        }),
      transferAsset: (id, toLocationId, reason) =>
        commit((s) => {
          const a = s.assets.find((x) => x.id === id);
          if (!a) return s;
          const toLoc = s.locations.find((l) => l.id === toLocationId);
          const toBranchId = toLoc?.branchId ?? a.branchId;
          const who = s.session?.name ?? '';
          const mv = {
            id: uid('MV'),
            assetId: id,
            fromBranchId: a.branchId,
            toBranchId,
            fromLocationId: a.locationId,
            toLocationId,
            movementDate: TODAY,
            reason,
            by: who,
            at: nowIso(),
          };
          return {
            ...s,
            assets: s.assets.map((x) => (x.id === id ? { ...x, locationId: toLocationId, branchId: toBranchId, updatedAt: nowIso(), updatedBy: who } : x)),
            movements: [mv, ...s.movements],
            audit: [mkAudit({ action: 'TRANSFER', assetCode: a.code, entity: 'asset_movements', field: 'locationId', oldValue: a.locationId ?? '—', newValue: toLoc?.code ?? toLocationId, reason }), ...s.audit],
          };
        }),
      disposeAsset: (id, input, reason) =>
        commit((s) => {
          const a = s.assets.find((x) => x.id === id);
          if (!a) return s;
          const who = s.session?.name ?? '';
          const gainLoss = Math.round((input.proceeds - input.nbvAtDisposal) * 100) / 100;
          const dp = {
            id: uid('DP'),
            assetId: id,
            disposalType: input.disposalType,
            disposalDate: TODAY,
            proceeds: input.proceeds,
            nbvAtDisposal: input.nbvAtDisposal,
            gainLoss,
            reason,
            by: who,
            at: nowIso(),
          };
          return {
            ...s,
            assets: s.assets.map((x) => (x.id === id ? { ...x, status: 'DISPOSED' as const, updatedAt: nowIso(), updatedBy: who } : x)),
            disposals: [dp, ...s.disposals],
            audit: [mkAudit({ action: 'DISPOSE', assetCode: a.code, entity: 'asset_disposals', field: 'status', oldValue: a.status, newValue: `DISPOSED (${input.disposalType})`, reason }), ...s.audit],
          };
        }),
      addMaintenance: (id, input) =>
        commit((s) => {
          const a = s.assets.find((x) => x.id === id);
          if (!a) return s;
          const who = s.session?.name ?? '';
          const mn = { id: uid('MN'), assetId: id, type: input.type, date: input.date, cost: input.cost, vendor: input.vendor, note: input.note, by: who, at: nowIso() };
          return {
            ...s,
            maintenance: [mn, ...s.maintenance],
            audit: [mkAudit({ action: 'MAINTENANCE', assetCode: a.code, entity: 'asset_maintenance', newValue: input.type, reason: input.note || undefined }), ...s.audit],
          };
        }),
      createAsset: (a, reason) => {
        let newId = '';
        commit((s) => {
          const { codes, running } = nextCodes(s, a.companyId, a.categoryId, 1);
          newId = uid('A');
          const asset: Asset = { ...a, id: newId, code: codes[0], createdAt: nowIso(), createdBy: s.session?.name ?? '', updatedAt: nowIso(), updatedBy: s.session?.name ?? '' };
          return { ...s, running, assets: [asset, ...s.assets], audit: [mkAudit({ action: 'CREATE', assetCode: asset.code, entity: 'assets', newValue: 'manual', reason }), ...s.audit] };
        });
        return newId;
      },
      importAssets: (rows) => {
        commit((s) => ({
          ...s,
          assets: [...rows, ...s.assets],
          audit: [mkAudit({ action: 'EXCEL_IMPORT', entity: 'asset_import_batches', newValue: `${rows.length} rows`, source: 'EXCEL_IMPORT' }), ...s.audit],
        }));
        return rows.length;
      },
      setOAStatus: (id, status, extra, reason) =>
        commit((s) => {
          const o = s.oa.find((x) => x.id === id);
          if (!o) return s;
          return {
            ...s,
            oa: s.oa.map((x) => (x.id === id ? { ...x, ...extra, status } : x)),
            audit: [mkAudit({ action: `OA_${status}`, entity: 'oa_records', field: 'status', oldValue: o.status, newValue: `${o.oaNo} → ${status}`, reason }), ...s.audit],
          };
        }),
      createFromOA: (id, { split, subcategoryId }) => {
        const ids: string[] = [];
        let cbDocNo: string | undefined;
        let cbCodes: string[] = [];
        let cbAmount = 0;
        commit((s) => {
          const o = s.oa.find((x) => x.id === id);
          if (!o) return s;
          const n = split ? o.quantity : 1;
          const sub = s.categories.find((c) => c.id === subcategoryId);
          const parentId = sub?.parentId ?? subcategoryId;
          const parent = s.categories.find((c) => c.id === parentId);
          const { codes, running } = nextCodes(s, o.companyId, parentId, n);
          cbDocNo = o.docNo;
          cbCodes = codes;
          cbAmount = o.amount;
          const policy = s.policies.find((p) => p.categoryId === parentId && p.active);
          const unitCost = Math.round((o.amount / o.quantity) * 100) / 100;
          const created: Asset[] = codes.map((code, i) => {
            const aid = uid('A');
            ids.push(aid);
            const isLast = i === n - 1;
            const cost = split ? (isLast ? Math.round((o.amount - unitCost * (n - 1)) * 100) / 100 : unitCost) : o.amount;
            return {
              id: aid,
              code,
              nameTh: o.itemName,
              nameEn: o.itemName,
              description: o.itemDescription,
              categoryId: parentId,
              subcategoryId,
              companyId: o.companyId,
              branchId: o.branchId,
              departmentId: o.departmentId,
              costCenterId: o.costCenterId,
              locationId: o.locationId ?? null,
              holderId: null,
              serialNumber: split ? o.serialNumbers?.[i] ?? '' : (o.serialNumbers ?? []).join(', '),
              brand: '',
              model: '',
              unit: o.unit,
              quantity: split ? 1 : o.quantity,
              originalCost: cost,
              additionalCost: 0,
              residual: policy?.residual ?? parent?.defaultResidual ?? 1,
              lifeMonths: (sub?.defaultLifeYears ?? parent?.defaultLifeYears ?? policy?.lifeYears ?? 5) * 12,
              method: policy?.method ?? 'SL',
              policyId: policy?.id ?? null,
              acquisitionDate: o.invoiceDate ?? o.approvedDate,
              readyDate: null,
              status: 'DRAFT',
              hasPhoto: false,
              source: {
                oaNo: o.oaNo, poNo: o.poNo, grNo: o.grNo, invoiceNo: o.invoiceNo, supplier: o.supplier, purchaseDate: o.invoiceDate,
                // ถ้ามาจาก ONEBOOK (นำเข้าจากบัญชี) เก็บรหัสบัญชี/บริษัทไว้ส่ง journal ค่าเสื่อมกลับ
                glAccountCode: o.rawFields?.onebookAccountCode ? String(o.rawFields.onebookAccountCode) : undefined,
                glCompanyId: o.rawFields?.onebookCompanyId ? String(o.rawFields.onebookCompanyId) : undefined,
              },
              oaId: o.id,
              createdAt: nowIso(),
              createdBy: s.session?.name ?? '',
              updatedAt: nowIso(),
              updatedBy: s.session?.name ?? '',
            };
          });
          const docs: AssetDocument[] = created.flatMap((a) =>
            o.documents.map((f) => ({
              id: uid('DOC'),
              assetId: a.id,
              oaId: o.id,
              type: f.startsWith('OA') ? 'OA_APPROVAL' : f.startsWith('PO') ? 'PO' : 'INVOICE',
              fileName: f,
              uploadedBy: 'OA Sync',
              uploadedAt: o.importedAt,
              sourceSystem: 'OA',
              sourceDocNo: f.replace(/\.pdf$/, ''),
              sizeKb: 150,
            })),
          );
          return {
            ...s,
            running,
            assets: [...created, ...s.assets],
            documents: [...docs, ...s.documents],
            oa: s.oa.map((x) => (x.id === id ? { ...x, status: 'CREATED', createdAssetIds: created.map((c) => c.id) } : x)),
            audit: [
              mkAudit({ action: 'CREATE_FROM_OA', entity: 'assets', newValue: `${o.oaNo} → ${codes.join(', ')}`, reason: split ? `split ×${n}` : undefined }),
              ...s.audit,
            ],
          };
        });
        // รายงานกลับไปยัง OA ว่าขึ้นทะเบียนทรัพย์สินแล้ว (เฉพาะรายการที่มาจาก OA จริง = มี docNo)
        if (cbDocNo && cbCodes.length) {
          const assetUrl =
            typeof window !== 'undefined'
              ? `${window.location.origin}/assets?oa=${encodeURIComponent(cbDocNo)}`
              : undefined;
          void fetch('/api/oa/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              docNo: cbDocNo,
              assetCode: cbCodes.join(', '),
              assetUrl,
              amount: cbAmount,
            }),
          }).catch((e) => console.error('[OA callback]', e));
        }
        return ids;
      },
      syncOA: async () => {
        // ดึงคำขอที่อนุมัติแล้วจากระบบ OA จริง ผ่าน server route /api/oa/sync
        // (route ถือ API key ไว้ฝั่ง server — ดู src/app/api/oa/sync/route.ts)
        const res = await fetch('/api/oa/sync', { cache: 'no-store' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || `OA sync failed (${res.status})`);
        }
        const body = (await res.json()) as { records: OARecord[] };
        const incoming = body.records ?? [];

        let added = 0;
        commit((s) => {
          // dedupe: ข้ามรายการที่มี docNo (หรือ id) ซ้ำกับคิวเดิมอยู่แล้ว
          const seen = new Set(s.oa.map((o) => o.docNo ?? o.id));
          const fresh = incoming.filter((r) => !seen.has(r.docNo ?? r.id));
          added = fresh.length;
          if (fresh.length === 0) {
            return { ...s, oaIntegration: { ...s.oaIntegration, lastSyncAt: nowIso() } };
          }
          return {
            ...s,
            oa: [...fresh, ...s.oa],
            oaIntegration: { ...s.oaIntegration, lastSyncAt: nowIso() },
            audit: [
              mkAudit({
                action: 'OA_IMPORT',
                entity: 'oa_records',
                newValue: fresh.map((r) => r.oaNo).join(', '),
                source: 'OA_SYNC',
              }),
              ...s.audit,
            ],
          };
        });
        return added;
      },
      syncOnebook: async () => {
        // ดึงบิลที่เป็นทรัพย์สิน (ลงบัญชีแล้ว) จากระบบบัญชี ONEBOOK ผ่าน server route
        const res = await fetch('/api/onebook/sync', { cache: 'no-store' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || `ONEBOOK sync failed (${res.status})`);
        }
        const body = (await res.json()) as { records: OARecord[] };
        const incoming = body.records ?? [];

        let added = 0;
        commit((s) => {
          const seen = new Set(s.oa.map((o) => o.docNo ?? o.id));
          const fresh = incoming.filter((r) => !seen.has(r.docNo ?? r.id));
          added = fresh.length;
          if (fresh.length === 0) {
            return { ...s, oaIntegration: { ...s.oaIntegration, lastSyncAt: nowIso() } };
          }
          return {
            ...s,
            oa: [...fresh, ...s.oa],
            oaIntegration: { ...s.oaIntegration, lastSyncAt: nowIso() },
            audit: [
              mkAudit({
                action: 'ONEBOOK_IMPORT',
                entity: 'oa_records',
                newValue: fresh.map((r) => r.oaNo).join(', '),
                source: 'OA_SYNC',
              }),
              ...s.audit,
            ],
          };
        });
        return added;
      },
      addDocument: (d) =>
        commit((s) => {
          const doc: AssetDocument = { ...d, id: uid('DOC'), uploadedAt: nowIso(), uploadedBy: s.session?.name ?? '' };
          const asset = s.assets.find((a) => a.id === d.assetId);
          return {
            ...s,
            documents: [doc, ...s.documents],
            assets: d.type === 'PHOTO' && asset ? s.assets.map((a) => (a.id === asset.id ? { ...a, hasPhoto: true } : a)) : s.assets,
            audit: [mkAudit({ action: 'UPLOAD_DOCUMENT', assetCode: asset?.code, entity: 'asset_documents', newValue: `${d.type}: ${d.fileName}` }), ...s.audit],
          };
        }),
      createRun: (period) =>
        commit((s) =>
          s.runs.some((r) => r.period === period)
            ? s
            : {
                ...s,
                runs: [...s.runs, { id: `R-${period}`, period, status: 'DRAFT', assetCount: 0, amount: 0, createdBy: s.session?.name ?? '', createdAt: nowIso() }],
                audit: [mkAudit({ action: 'DEP_RUN_CREATED', entity: 'asset_depreciation_runs', newValue: period }), ...s.audit],
              },
        ),
      setRunStatus: (period, status, totals) =>
        commit((s) => ({
          ...s,
          runs: s.runs.map((r) => {
            if (r.period !== period) return r;
            const who = s.session?.name ?? '';
            const t = nowIso();
            return {
              ...r,
              ...(totals ?? {}),
              status,
              ...(status === 'CALCULATED' ? { calculatedAt: t } : {}),
              ...(status === 'REVIEWED' ? { reviewedAt: t, reviewedBy: who } : {}),
              ...(status === 'LOCKED' ? { lockedAt: t, lockedBy: who } : {}),
              ...(status === 'POSTED' ? { postedAt: t, postedBy: who } : {}),
            };
          }),
          audit: [mkAudit({ action: `DEP_RUN_${status}`, entity: 'asset_depreciation_runs', newValue: period }), ...s.audit],
        })),
      upsertMaster: (key, item, reason) =>
        commit((s) => {
          const list = s[key] as unknown as { id: string }[];
          const it = item as unknown as { id: string };
          const exists = list.some((x) => x.id === it.id);
          const next = exists ? list.map((x) => (x.id === it.id ? it : x)) : [...list, it];
          return {
            ...s,
            [key]: next,
            audit: [mkAudit({ action: exists ? 'UPDATE' : 'CREATE', entity: key, newValue: it.id, reason }), ...s.audit],
          };
        }),
      updateRunning: (cfg) =>
        commit((s) => ({
          ...s,
          running: s.running.map((r) => (r.companyId === cfg.companyId ? cfg : r)),
          audit: [mkAudit({ action: 'UPDATE', entity: 'running_numbers', newValue: `${cfg.prefix} / ${cfg.seqDigits}` }), ...s.audit],
        })),
      updateOAIntegration: (cfg) =>
        commit((s) => ({ ...s, oaIntegration: cfg, audit: [mkAudit({ action: 'UPDATE', entity: 'oa_integration', newValue: cfg.endpoint }), ...s.audit] })),
    };
  }, [state, ready, role, userName, mkAudit]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}
