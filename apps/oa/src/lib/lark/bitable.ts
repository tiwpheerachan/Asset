import "server-only";
import { feishuCall, feishuConfig, feishuReady, FeishuError } from "./feishu-core";

/**
 * อ่านข้อมูลจาก Feishu Base (多维表格 / Bitable) แบบอ่านอย่างเดียว
 * ใช้แกนกลาง feishu-core (แอป "OA Base Reader" scope bitable:app:readonly)
 * ไม่มีสิทธิ์ แก้/เพิ่ม/ลบ ใดๆ — ใช้แค่ GET ดึงตาราง/ฟิลด์/เรคคอร์ด
 */

// คงชื่อเดิมไว้เพื่อไม่ให้โค้ดที่เรียกอยู่พัง
export const bitableConfig = feishuConfig;
export const bitableReady = feishuReady;
export { FeishuError as BitableError };

export type BaseTable = { table_id: string; name: string; revision?: number };
export type BaseField = { field_id: string; field_name: string; type: number; property?: unknown };
export type BaseRecord = { record_id: string; fields: Record<string, unknown>; created_time?: number; last_modified_time?: number };

/** ข้อมูลพื้นฐานของ Base — ใช้ทดสอบว่าเชื่อม + มีสิทธิ์อ่านจริงไหม */
export async function getBaseMeta(appToken: string): Promise<{ app: { name: string; revision: number } }> {
  return feishuCall(`/open-apis/bitable/v1/apps/${appToken}`);
}

/** รายชื่อตารางทั้งหมดใน Base */
export async function listTables(appToken: string): Promise<BaseTable[]> {
  const out: BaseTable[] = [];
  let pageToken: string | undefined;
  do {
    const data = await feishuCall<{ items?: BaseTable[]; page_token?: string; has_more?: boolean }>(
      `/open-apis/bitable/v1/apps/${appToken}/tables`,
      { query: { page_size: "100", ...(pageToken ? { page_token: pageToken } : {}) } },
    );
    out.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);
  return out;
}

/** ฟิลด์ (คอลัมน์) ของตาราง — ใช้ map ชื่อคอลัมน์ → ความหมาย */
export async function listFields(appToken: string, tableId: string): Promise<BaseField[]> {
  const out: BaseField[] = [];
  let pageToken: string | undefined;
  do {
    const data = await feishuCall<{ items?: BaseField[]; page_token?: string; has_more?: boolean }>(
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
      { query: { page_size: "100", ...(pageToken ? { page_token: pageToken } : {}) } },
    );
    out.push(...(data.items ?? []));
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);
  return out;
}

/** ดึงเรคคอร์ดทั้งหมดของตาราง (วนทีละหน้าจนครบ) */
export async function listAllRecords(
  appToken: string,
  tableId: string,
  opts: { viewId?: string; pageSize?: number; onPage?: (rows: BaseRecord[], fetched: number, total?: number) => void | Promise<void> } = {},
): Promise<BaseRecord[]> {
  const out: BaseRecord[] = [];
  const pageSize = String(opts.pageSize ?? 500);
  let pageToken: string | undefined;
  let total: number | undefined;
  do {
    const data = await feishuCall<{ items?: BaseRecord[]; page_token?: string; has_more?: boolean; total?: number }>(
      `/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      {
        query: {
          page_size: pageSize,
          ...(opts.viewId ? { view_id: opts.viewId } : {}),
          ...(pageToken ? { page_token: pageToken } : {}),
        },
      },
    );
    const rows = data.items ?? [];
    out.push(...rows);
    total = data.total ?? total;
    if (opts.onPage) await opts.onPage(rows, out.length, total);
    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);
  return out;
}

/** ทดสอบการเชื่อม — คืนชื่อ Base + จำนวนตาราง หรือ error ที่อ่านง่าย */
export async function testBitable(appToken: string): Promise<
  | { ok: true; baseName: string; tables: { id: string; name: string }[] }
  | { ok: false; error: string }
> {
  try {
    const [meta, tables] = await Promise.all([getBaseMeta(appToken), listTables(appToken)]);
    return {
      ok: true,
      baseName: meta.app?.name ?? appToken,
      tables: tables.map((t) => ({ id: t.table_id, name: t.name })),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
