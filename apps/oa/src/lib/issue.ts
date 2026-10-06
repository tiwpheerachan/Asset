import "server-only";
import { db } from "./db";
import { logAudit, nextSeq } from "./queries";
import { enqueueWebhook } from "./integration";

/**
 * ออกเอกสารจากคำขอที่อนุมัติแล้ว
 *
 * เลขที่เดินแยกชุดตามประเภท (INV / CN / DN / RC) และรีเซ็ตรายเดือน
 * เพราะฝ่ายบัญชีต้องการเลขที่ต่อเนื่องของแต่ละชุด ไม่ใช่เลขรวมที่ปนกันทุกประเภท
 *
 * ออกได้เฉพาะคำขอที่ APPROVED แล้วเท่านั้น — เอกสารที่ออกจากเรื่องที่ยังไม่อนุมัติ
 * คือเอกสารที่ไม่มีใครรับรอง ซึ่งอันตรายกว่าการไม่มีเอกสาร
 */

export const DOC_TYPES = ["INVOICE", "CN", "DN", "RECEIPT", "OTHER"] as const;
export type DocType = (typeof DOC_TYPES)[number];

const PREFIX: Record<DocType, string> = {
  INVOICE: process.env.DOC_PREFIX_INVOICE || "INV",
  CN: process.env.DOC_PREFIX_CN || "CN",
  DN: process.env.DOC_PREFIX_DN || "DN",
  RECEIPT: process.env.DOC_PREFIX_RECEIPT || "RC",
  OTHER: process.env.DOC_PREFIX_OTHER || "DOC",
};

export type IssuedDocument = {
  id: number;
  request_id: number;
  doc_type: DocType;
  doc_number: string;
  seq: number;
  period: string;
  issued_at: string;
  issued_by: number | null;
  note: string;
  void: number;
  void_reason: string;
  issued_by_name?: string;
  doc_no?: string;
  title?: string;
};

const SELECT = `
  SELECT i.*, u.name AS issued_by_name, r.doc_no, r.title
    FROM issued_documents i
    LEFT JOIN users u ON u.id = i.issued_by
    JOIN requests r ON r.id = i.request_id
`;

export async function listIssued(requestId?: number): Promise<IssuedDocument[]> {
  const where = requestId ? "WHERE i.request_id = ?" : "";
  return (await db
    .prepare(`${SELECT} ${where} ORDER BY i.id DESC`)
    .all(...(requestId ? [requestId] : []))) as IssuedDocument[];
}

export async function getIssued(id: number): Promise<IssuedDocument | null> {
  return ((await db.prepare(`${SELECT} WHERE i.id = ?`).get(id)) as IssuedDocument) ?? null;
}

export type IssueResult = { error?: string; doc?: IssuedDocument };

export async function issueDocument(input: {
  requestId: number;
  docType: DocType;
  note: string;
  userId: number;
}): Promise<IssueResult> {
  const { requestId, docType, note, userId } = input;
  if (!DOC_TYPES.includes(docType)) return { error: "ประเภทเอกสารไม่ถูกต้อง" };

  const req = (await db.prepare("SELECT id, status, doc_no FROM requests WHERE id = ?").get(requestId)) as
    | { id: number; status: string; doc_no: string }
    | undefined;
  if (!req) return { error: "ไม่พบคำขอ" };
  if (req.status !== "APPROVED") return { error: "ออกเอกสารได้เฉพาะคำขอที่อนุมัติครบแล้ว" };

  const now = new Date();
  const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  // เดินเลขด้วยตัวนับกลาง ไม่ใช่การอ่านค่าสูงสุดมาบวกหนึ่ง
  //
  // ของเดิมห่อไว้ใน transaction แล้วคิดว่ากันเลขซ้ำได้ แต่ไม่ได้กัน — ระดับการแยกกัน
  // เริ่มต้นของ Postgres ยอมให้สองธุรกรรมอ่าน MAX(seq) ค่าเดียวกันแล้วเขียนทับกัน
  const run = db.transaction(async () => {
    const last = (await db
      .prepare(
        "SELECT MAX(seq) AS n FROM issued_documents WHERE doc_type = ? AND period = ?",
      )
      .get(docType, period)) as { n: number | null };
    const seq = await nextSeq(PREFIX[docType], period, (last.n ?? 0) + 1);
    const number = `${PREFIX[docType]}-${period}-${String(seq).padStart(4, "0")}`;

    const info = (await db
      .prepare(
        `INSERT INTO issued_documents (request_id, doc_type, doc_number, seq, period, issued_by, note)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(requestId, docType, number, seq, period, userId, note));
    return Number(info.lastInsertRowid);
  });

  const id = await run();
  const doc = (await getIssued(id))!;
  await logAudit(requestId, userId, "ISSUE_DOC", `ออกเอกสาร ${doc.doc_number}`, null);
  await enqueueWebhook("document.issued", requestId, { document: doc.doc_number, doc_type: doc.doc_type });
  return { doc };
}

/**
 * ยกเลิกเอกสาร — ไม่ลบแถวทิ้ง
 * เลขที่ออกไปแล้วต้องคงอยู่ในสารบบเสมอ ไม่งั้นเลขจะขาดช่วงโดยไม่มีคำอธิบาย
 */
export async function voidDocument(id: number, reason: string, userId: number): Promise<IssueResult> {
  const doc = await getIssued(id);
  if (!doc) return { error: "ไม่พบเอกสาร" };
  if (doc.void) return { error: "เอกสารนี้ถูกยกเลิกไปแล้ว" };
  if (!reason.trim()) return { error: "กรุณาระบุเหตุผลที่ยกเลิก" };

  await db.prepare("UPDATE issued_documents SET void=1, void_reason=? WHERE id=?").run(reason.trim(), id);
  (await logAudit(doc.request_id, userId, "VOID_DOC", `ยกเลิกเอกสาร ${doc.doc_number}: ${reason}`, null));
  // บัญชีที่ลงเอกสารตามเลขนี้ไปแล้วต้องกลับรายการ
  await enqueueWebhook("document.voided", doc.request_id, {
    document: doc.doc_number,
    doc_type: doc.doc_type,
    reason: reason.trim(),
  });
  return { doc: (await getIssued(id))! };
}
