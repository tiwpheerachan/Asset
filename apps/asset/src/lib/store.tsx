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
  Location,
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
  previewCode: (companyId: string, date?: string) => string;
  updateAsset: (id: string, patch: Partial<Asset>, reason?: string) => void;
  setAssetStatus: (id: string, status: AssetStatus, reason?: string) => void;
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

function formatCode(cfg: RunningNumberConfig, date: string, seq: number) {
  const [y, m, d] = date.split('-');
  return `${cfg.prefix}${cfg.includeYear ? y.slice(2) : ''}${cfg.includeMonth ? m : ''}${cfg.includeDay ? d : ''}${String(seq).padStart(cfg.seqDigits, '0')}`;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(seedState);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // บันทึกลง DB แบบต่อคิว (กันไม่ให้ POST ทับกันจนเขียนทั้งตารางพร้อมกันหลายรอบ)
  const savingRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const flushSave = useCallback(async (body: string) => {
    if (savingRef.current) {
      pendingRef.current = body; // เก็บเวอร์ชันล่าสุดไว้ แล้วค่อยเขียนหลังอันปัจจุบันเสร็จ
      return;
    }
    savingRef.current = true;
    try {
      await fetch('/api/fa/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    } catch {
      /* จะลองใหม่เมื่อ state เปลี่ยนครั้งถัดไป */
    } finally {
      savingRef.current = false;
      const next = pendingRef.current;
      if (next) {
        pendingRef.current = null;
        void flushSave(next);
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
          const db = (await res.json()) as State;
          if (!cancelled && db && Array.isArray(db.assets)) {
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
      const { session: _session, ...rest } = state;
      void _session;
      void flushSave(JSON.stringify(rest));
    }, 400);
    return () => clearTimeout(t);
  }, [state, ready, flushSave]);

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

    const nextCodes = (s: State, companyId: string, n: number, date = TODAY): { codes: string[]; running: RunningNumberConfig[] } => {
      const cfg = s.running.find((r) => r.companyId === companyId) ?? s.running[0];
      const codes = Array.from({ length: n }, (_, i) => formatCode(cfg, date, cfg.nextSeq + i));
      return { codes, running: s.running.map((r) => (r === cfg ? { ...r, nextSeq: r.nextSeq + n } : r)) };
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
      previewCode: (companyId, date = TODAY) => {
        const cfg = state.running.find((r) => r.companyId === companyId) ?? state.running[0];
        return formatCode(cfg, date, cfg.nextSeq);
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
      createAsset: (a, reason) => {
        let newId = '';
        commit((s) => {
          const { codes, running } = nextCodes(s, a.companyId, 1);
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
          const { codes, running } = nextCodes(s, o.companyId, n);
          cbDocNo = o.docNo;
          cbCodes = codes;
          cbAmount = o.amount;
          const sub = s.categories.find((c) => c.id === subcategoryId);
          const parentId = sub?.parentId ?? subcategoryId;
          const parent = s.categories.find((c) => c.id === parentId);
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
              source: { oaNo: o.oaNo, poNo: o.poNo, grNo: o.grNo, invoiceNo: o.invoiceNo, supplier: o.supplier, purchaseDate: o.invoiceDate },
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
