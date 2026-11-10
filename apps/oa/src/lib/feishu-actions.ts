"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./auth";
import { bitableReady } from "./lark/bitable";
import { testBitable } from "./lark/bitable";
import {
  baseAppToken, registerTables, enabledTables, setTableEnabled, syncTable, syncAll, syncReady,
} from "./lark/base-sync";
import { oaExportReady, syncOa, oaForms, oaTotal, readOa, queryOa, oaSyncHistory, oaChangeHistory, oaSyncCount, oaChangeCount, oaHistoryCounts, type OaQuery } from "./oa-export/sync";
import { listForms } from "./oa-export/client";
import { resolvePeople } from "./oa-export/people";

/** สถานะ + ตารางที่เลือกไว้ (เรียกจากหน้า settings) */
export async function feishuStatus() {
  await requireAdmin();
  return {
    ready: syncReady() && bitableReady(),
    appToken: baseAppToken(),
    tables: await enabledTables(),
  };
}

/** ทดสอบเชื่อม Base — คืนชื่อ Base + รายชื่อตาราง หรือ error */
export async function feishuTest() {
  await requireAdmin();
  if (!bitableReady()) return { ok: false as const, error: "ยังไม่ได้ตั้งค่า FEISHU_BASE_APP_ID / SECRET ใน env" };
  return testBitable(baseAppToken());
}

/** ดึงรายชื่อตารางจาก Base มาลงทะเบียน (ยังไม่ดึงเรคคอร์ด) */
export async function feishuLoadTables() {
  await requireAdmin();
  if (!bitableReady()) return { ok: false as const, error: "ยังไม่ได้ตั้งค่า key ใน env" };
  try {
    const tables = await registerTables();
    revalidatePath("/admin/feishu");
    return { ok: true as const, tables };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** เปิด/ปิดการซิงก์รายตาราง */
export async function feishuToggleTable(tableId: string, enabled: boolean) {
  await requireAdmin();
  await setTableEnabled(tableId, enabled);
  revalidatePath("/admin/feishu");
  return { ok: true as const };
}

/* ==================== OA Export API (feishu-approval-to-base) ==================== */

/** สถานะ Export API + รายชื่อฟอร์ม */
export async function oaExportStatus() {
  await requireAdmin();
  if (!oaExportReady()) return { ready: false as const };
  try {
    const forms = await listForms();
    return { ready: true as const, forms };
  } catch (e) {
    return { ready: true as const, error: (e as Error).message, forms: [] };
  }
}

/** ซิงก์ OA จาก Export API เข้า OA (ทีละชุด ต่อ cursor · reset=เริ่มใหม่) */
export async function oaExportSyncNow(opts: { reset?: boolean; maxPages?: number } = {}) {
  await requireAdmin();
  if (!oaExportReady()) return { ok: false as const, error: "ยังไม่ได้ตั้ง OA_EXPORT_URL / OA_EXPORT_KEY" };
  try {
    const r = await syncOa({ reset: opts.reset, maxPages: opts.maxPages ?? 200, source: "manual" });
    revalidatePath("/admin/feishu");
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** รายชื่อฟอร์ม OA + จำนวนที่ซิงก์ (ไว้แสดงหน้า viewer) */
export async function oaExportForms() {
  await requireAdmin();
  return { total: await oaTotal(), forms: await oaForms() };
}

/** ประวัติการซิงก์ + ประวัติการเปลี่ยนแปลงเอกสาร (ไว้แสดงหน้า viewer) */
export async function oaExportHistory() {
  await requireAdmin();
  const [syncs, changes] = await Promise.all([oaSyncHistory(20), oaChangeHistory(60)]);
  return { syncs, changes };
}

/** ค้น/โหลดประวัติ (หน้าประวัติแยก) — รองรับตัวกรอง + ทีละชุดตาม offset · คืน rows + total */
export async function oaHistoryQuery(
  kind: "sync" | "change",
  opts: { offset?: number; limit?: number; from?: string; to?: string; source?: string; changeKind?: string; q?: string } = {},
) {
  await requireAdmin();
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 50;
  if (kind === "sync") {
    const f = { from: opts.from, to: opts.to, source: opts.source };
    const [rows, total] = await Promise.all([oaSyncHistory(limit, offset, f), oaSyncCount(f)]);
    return { rows, total };
  }
  const f = { from: opts.from, to: opts.to, kind: opts.changeKind, q: opts.q };
  const [rows, total] = await Promise.all([oaChangeHistory(limit, offset, f), oaChangeCount(f)]);
  return { rows, total };
}

/** อ่าน OA ของฟอร์มหนึ่ง (ไว้แสดงรายการ) */
export async function oaExportRecords(formCode: string, opts: { limit?: number; offset?: number } = {}) {
  await requireAdmin();
  const rows = await readOa(formCode, { limit: opts.limit ?? 50, offset: opts.offset ?? 0 });
  return rows.map((r) => r.fields);
}

/** ค้นข้ามทุกฟอร์มตามตัวกรอง (ไว้ drill-down จาก dashboard) */
export async function oaExportSearch(f: OaQuery) {
  await requireAdmin();
  const rows = await queryOa({ ...f, limit: f.limit ?? 200 });
  return rows.map((r) => r.fields);
}

/** จับคู่โปรไฟล์พนักงาน (รูป/ตำแหน่ง) จาก Lark directory — cache-first, จับคู่ชื่อตรงเป๊ะ */
export async function oaResolvePeople(people: { user_id?: string; name?: string }[]) {
  await requireAdmin();
  try { return await resolvePeople(people); } catch { return {}; }
}

/** ดึงเดี๋ยวนี้ — ตารางเดียว (ถ้าส่ง tableId) หรือทุกตารางที่เปิดไว้ */
export async function feishuSyncNow(tableId?: string) {
  await requireAdmin();
  if (!bitableReady()) return { ok: false as const, error: "ยังไม่ได้ตั้งค่า key ใน env" };
  try {
    const results = tableId ? [await syncTable(tableId)] : await syncAll();
    revalidatePath("/admin/feishu");
    return { ok: true as const, results };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
