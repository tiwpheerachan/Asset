'use client';

import { useMemo } from 'react';
import { useI18n } from './i18n';
import { CURRENT_PERIOD, useStore } from './store';
import { prorationFor, valuate, type Valuation } from './depreciation';
import type { Asset } from './types';
import { UNITS } from '@/data/masters';

/** Name lookups for master data in the active language. */
export function useLookups() {
  const { state, accounts } = useStore();
  const { L, lang } = useI18n();
  return useMemo(() => {
    const by = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]));
    const cats = by(state.categories);
    const comps = by(state.companies);
    const brs = by(state.branches);
    const deps = by(state.departments);
    const ccs = by(state.costCenters);
    const locs = by(state.locations);
    const pols = by(state.policies);
    // แมปบัญชีด้วยทั้ง id (ถาวร) และ code (ของเดิม) → อ้างอิงได้ทั้งสองแบบ (backward-compat)
    const accs = new Map<string, (typeof accounts)[number]>();
    for (const a of accounts) {
      accs.set(a.id, a);
      accs.set(a.code, a); // รองรับข้อมูลเดิมที่เคยเก็บเป็น code
    }
    return {
      category: (id?: string | null) => (id ? L(cats.get(id)?.name) || id : ''),
      categoryObj: (id?: string | null) => (id ? cats.get(id) : undefined),
      company: (id?: string | null) => (id ? L(comps.get(id)?.name) : ''),
      companyCode: (id?: string | null) => (id ? comps.get(id)?.code ?? '' : ''),
      branch: (id?: string | null) => (id ? L(brs.get(id)?.name) : ''),
      department: (id?: string | null) => (id ? L(deps.get(id)?.name) : ''),
      costCenter: (id?: string | null) => {
        const c = id ? ccs.get(id) : undefined;
        return c ? `${c.code} · ${L(c.name)}` : '';
      },
      location: (id?: string | null) => (id ? L(locs.get(id)?.name) : ''),
      locationObj: (id?: string | null) => (id ? locs.get(id) : undefined),
      // เส้นทางเต็มของสถานที่ ไล่จากแม่ลงมา เช่น "ชั้น 7 › Digital Transformation › IT Room"
      locationPath: (id?: string | null) => {
        if (!id) return '';
        const parts: string[] = [];
        let cur = locs.get(id);
        let guard = 0;
        while (cur && guard++ < 20) {
          parts.unshift(L(cur.name) || cur.code);
          cur = cur.parentLocationId ? locs.get(cur.parentLocationId) : undefined;
        }
        return parts.join(' › ');
      },
      policy: (id?: string | null) => (id ? L(pols.get(id)?.name) : ''),
      policyObj: (id?: string | null) => (id ? pols.get(id) : undefined),
      // แสดงผล: รับได้ทั้ง id ถาวรหรือ code → คืน "code — ชื่อ"
      account: (ref?: string) => {
        const a = ref ? accs.get(ref) : undefined;
        return a ? `${a.code} — ${L(a.name)}` : ref ?? '';
      },
      // คืน id ถาวร (normalize ค่าเดิมที่เป็น code ให้กลายเป็น id) — ใช้ตั้งค่า value ของ dropdown
      accountId: (ref?: string) => (ref ? accs.get(ref)?.id ?? ref : ''),
      // คืน code (ใช้ตอนต้องส่งเลขบัญชีออกนอกระบบ)
      accountCode: (ref?: string) => (ref ? accs.get(ref)?.code ?? ref : ''),
      unit: (u: string) => (UNITS[u] ? UNITS[u][lang] : u),
      assetName: (a: Pick<Asset, 'nameTh' | 'nameEn'>) => (lang === 'th' ? a.nameTh : a.nameEn || a.nameTh),
    };
  }, [state, accounts, L, lang]);
}

/** Valuation for every asset at a given period. */
export function useValuations(period = CURRENT_PERIOD) {
  const { state } = useStore();
  return useMemo(() => {
    const m = new Map<string, Valuation>();
    for (const a of state.assets) m.set(a.id, valuate(a, period, prorationFor(a, state.policies)));
    return m;
  }, [state.assets, state.policies, period]);
}

/** Missing-data flags used by Dashboard, Register filters and the Missing Data report. */
export function useMissingFlags() {
  const { state } = useStore();
  return useMemo(() => {
    const docAssets = new Set(state.documents.filter((d) => d.type !== 'PHOTO').map((d) => d.assetId));
    const catMap = new Map(state.categories.map((c) => [c.id, c]));
    const polIds = new Set(state.policies.filter((p) => p.active).map((p) => p.id));
    const res = new Map<string, { photo: boolean; category: boolean; location: boolean; document: boolean; mapping: boolean; policy: boolean }>();
    for (const a of state.assets) {
      const cat = catMap.get(a.subcategoryId) ?? catMap.get(a.categoryId);
      res.set(a.id, {
        photo: !a.hasPhoto,
        category: !a.categoryId || !a.subcategoryId,
        location: !a.locationId,
        document: !docAssets.has(a.id),
        mapping: !cat || !cat.assetAccount || !cat.expenseAccount || !cat.accumAccount,
        policy: !a.policyId || !polIds.has(a.policyId),
      });
    }
    return res;
  }, [state.assets, state.documents, state.categories, state.policies]);
}
