import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listRequestsForTable } from "@/lib/queries";
import { getT } from "@/lib/i18n/server";
import { STATUS_LABEL } from "@/lib/types";

/**
 * ส่งออกรายการคำขอเป็น CSV — ใช้ตัวกรองชุดเดียวกับหน้ารายการ
 * และผ่านสิทธิ์การมองเห็นตัวเดียวกัน คนส่งออกจึงได้เฉพาะที่ตัวเองมีสิทธิ์เห็นอยู่แล้ว
 */

/** หุ้มค่าตามกติกา CSV และกัน formula injection ใน Excel */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * ที่อยู่ของระบบสำหรับประกอบลิงก์ในไฟล์ที่ส่งออก
 *
 * ต้องเป็น URL เต็มเสมอ — ไฟล์ CSV ถูกเปิดนอกเว็บ (Excel / Numbers / Google Sheets)
 * ลิงก์แบบ /requests/12 จึงกดไม่ได้ ไม่มีอะไรบอกโปรแกรมว่าโดเมนไหน
 *
 * ถ้าไม่ได้ตั้ง APP_BASE_URL ไว้ ใช้โดเมนที่คำขอนี้วิ่งเข้ามาแทน ซึ่งถูกต้องเสมอ
 * สำหรับคนที่กำลังกดปุ่มดาวน์โหลดอยู่
 */
function baseUrl(req: Request): string {
  const fromEnv = process.env.APP_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return new URL(req.url).origin;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const t = await getT();
  const sp = new URL(req.url).searchParams;
  const tabRaw = sp.get("tab") ?? "all";
  const status = sp.get("status") ?? undefined;

  const { rows } = await listRequestsForTable(user, {
    tab: (["all", "awaiting", "mine", "team"].includes(tabRaw) ? tabRaw : "all") as "all",
    status: status && status in STATUS_LABEL ? status : undefined,
    templateId: sp.get("tpl") ? Number(sp.get("tpl")) : undefined,
    q: sp.get("q") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    limit: 10_000, // เพดานกันไฟล์ใหญ่เกินจนเครื่องอืด
  });

  const base = baseUrl(req);

  const header = [
    t("table.docNo"), t("detail.type"), t("table.subject"), t("table.requester"),
    t("detail.department"), t("table.amount"), t("table.date"), t("table.status"),
    t("detail.submittedAt"), t("detail.closedAt"), t("remind.stuckAt"),
    t("list.exportLink"),
  ];

  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    // ค้างอยู่ที่ใคร — มีความหมายเฉพาะฉบับที่ยังเดินอยู่
    //
    // เดิมถามผู้อนุมัติทีละใบในลูปนี้ ซึ่งเป็นคำสั่งฐานข้อมูลหนึ่งครั้งต่อหนึ่งแถว —
    // ส่งออกพันแถวคือวิ่งข้ามเครือข่ายพันรอบ ตอนนี้ listRequestsForTable ดึงมาให้
    // พร้อมกันทั้งชุดในคำสั่งเดียวแล้ว
    const waiting = r.status === "PENDING" ? r.current_handlers.join(" / ") : "";

    lines.push(
      [
        r.doc_no, r.template_name, r.title, r.requester_name, r.requester_department,
        r.amount ?? "", r.doc_date, t(`status.${r.status}`),
        r.submitted_at ?? "", r.closed_at ?? "", waiting,
        `${base}/requests/${r.id}`,
      ].map(cell).join(","),
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM ข้างหน้า ไม่งั้น Excel บนวินโดวส์เปิดไฟล์แล้วภาษาไทยเป็นขยะ
  const body = `﻿${lines.join("\r\n")}\r\n`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="requests-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
