"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./auth";
import { oaForms } from "./oa-export/sync";
import {
  getConfig, setFormKind, queue, summary, getOaDoc,
  markChecked, markPosted, markReversed, markSkipped,
  type FormKind,
} from "./accounting/store";

function who(u: any): string {
  return (u?.name as string) || (u?.display_name as string) || (u?.email as string) || String(u?.id ?? "admin");
}

/** ฟอร์มทั้งหมด + ประเภท (บัญชี/สินทรัพย์/ไม่เข้า) */
export async function acctForms() {
  await requireAdmin();
  const [forms, cfg] = await Promise.all([oaForms(), getConfig()]);
  return forms.map((f) => ({
    ...f,
    kind: (cfg.accounting.includes(f.form_code) ? "accounting" : cfg.asset.includes(f.form_code) ? "asset" : "none") as FormKind,
  }));
}

export async function acctSetKind(formCode: string, kind: FormKind) {
  await requireAdmin();
  await setFormKind(formCode, kind);
  revalidatePath("/admin/accounting");
  return { ok: true as const };
}

export async function acctQueue(formCode: string, status?: string) {
  await requireAdmin();
  const [rows, sum] = await Promise.all([queue(formCode, { status, limit: 200 }), summary(formCode)]);
  return { rows, summary: sum };
}

/** รายละเอียดเอกสาร + สิ่งที่ AI สแกนอ่าน (ประกอบการตัดสินใจ) */
export async function acctDetail(oaKey: string) {
  await requireAdmin();
  const oa = await getOaDoc(oaKey);
  if (!oa) return null;
  const files = (oa.attachments?.files ?? []).map((f) => ({
    name: f.name, download: f.download, ai: f.ai?.final ?? null, aiStatus: f.ai?.status ?? null,
  }));
  return { serial: oa.serial, form_name: oa.form_name, status: oa.status, fields: oa.fields, files, flags: oa.flags };
}

export async function acctCheck(oaKey: string, formCode: string, amount: number | null, note: string) {
  const u = await requireAdmin();
  await markChecked(oaKey, formCode, amount, note, who(u));
  revalidatePath("/admin/accounting");
  return { ok: true as const };
}

export async function acctPost(oaKey: string, formCode: string, amount: number | null) {
  const u = await requireAdmin();
  try {
    const ref = await markPosted(oaKey, formCode, amount, who(u));
    revalidatePath("/admin/accounting");
    return { ok: true as const, onebook_ref: ref };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function acctReverse(oaKey: string, formCode: string) {
  const u = await requireAdmin();
  await markReversed(oaKey, formCode, who(u));
  revalidatePath("/admin/accounting");
  return { ok: true as const };
}

export async function acctSkip(oaKey: string, formCode: string) {
  const u = await requireAdmin();
  await markSkipped(oaKey, formCode, who(u));
  revalidatePath("/admin/accounting");
  return { ok: true as const };
}
