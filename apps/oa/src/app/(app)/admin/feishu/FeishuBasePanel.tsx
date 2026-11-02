"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { feishuTest, feishuLoadTables, feishuToggleTable, feishuSyncNow } from "@/lib/feishu-actions";

type TableRow = { table_id: string; name: string; enabled: boolean; last_synced_at: string; record_count: number };

export default function FeishuBasePanel({
  ready, appToken, initialTables,
}: {
  ready: boolean;
  appToken: string;
  initialTables: TableRow[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [testInfo, setTestInfo] = useState<{ baseName: string; tables: { id: string; name: string }[] } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<any>, after?: (r: any) => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r && r.ok === false) { setMsg({ kind: "err", text: r.error || "ไม่สำเร็จ" }); return; }
      after?.(r);
      router.refresh();
    });

  const tables = initialTables;

  return (
    <div className="space-y-5">
      {/* สถานะ env */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ready ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-green-500" : "bg-amber-500"}`} />
          {ready ? "ตั้งค่า key ครบ (พร้อมเชื่อม)" : "ยังไม่ได้ตั้ง FEISHU_BASE_APP_ID / SECRET"}
        </span>
        <span className="text-xs text-gray-400">Base token: <code className="font-mono">{appToken}</code></span>
      </div>

      {msg && (
        <div className={`rounded-lg px-3 py-2 text-sm ${
          msg.kind === "ok" ? "bg-green-50 text-green-700" : msg.kind === "err" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
        }`}>{msg.text}</div>
      )}

      {/* ปุ่มหลัก */}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-ghost h-9 text-sm" disabled={pending}
          onClick={() => run(feishuTest, (r) => {
            if (r.ok) { setTestInfo({ baseName: r.baseName, tables: r.tables }); setMsg({ kind: "ok", text: `เชื่อม Base สำเร็จ: ${r.baseName} (${r.tables.length} ตาราง)` }); }
          })}>
          ทดสอบการเชื่อม
        </button>
        <button className="btn btn-ghost h-9 text-sm" disabled={pending}
          onClick={() => run(feishuLoadTables, (r) => r.ok && setMsg({ kind: "ok", text: `โหลด ${r.tables.length} ตารางแล้ว` }))}>
          โหลดรายชื่อตารางจาก Base
        </button>
        <button className="btn btn-primary h-9 text-sm" disabled={pending || tables.length === 0}
          onClick={() => run(() => feishuSyncNow(), (r) => {
            if (r.ok) { const n = r.results.reduce((a: number, x: any) => a + (x.fetched || 0), 0); setMsg({ kind: "ok", text: `ดึงข้อมูลแล้ว ${n} เรคคอร์ด` }); }
          })}>
          ดึงทั้งหมดเดี๋ยวนี้
        </button>
      </div>

      {/* ผลทดสอบ (รายชื่อตารางจาก Base สดๆ) */}
      {testInfo && (
        <div className="rounded-lg border border-gray-200 p-3 text-sm">
          <div className="mb-2 font-medium text-gray-700">ตารางใน Base "{testInfo.baseName}"</div>
          <div className="flex flex-wrap gap-1.5">
            {testInfo.tables.map((t) => (
              <span key={t.id} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* ตารางที่ลงทะเบียนไว้ */}
      {tables.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">ตาราง</th>
                <th className="px-3 py-2">ซิงก์</th>
                <th className="px-3 py-2">เรคคอร์ด</th>
                <th className="px-3 py-2">ซิงก์ล่าสุด</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tables.map((t) => (
                <tr key={t.table_id}>
                  <td className="px-3 py-2 text-gray-800">{t.name || t.table_id}</td>
                  <td className="px-3 py-2">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={t.enabled} disabled={pending}
                        onChange={(e) => run(() => feishuToggleTable(t.table_id, e.target.checked))} />
                      <span className="text-xs text-gray-500">{t.enabled ? "เปิด" : "ปิด"}</span>
                    </label>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{t.record_count.toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">{t.last_synced_at || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="text-xs text-blue-600 hover:underline" disabled={pending}
                      onClick={() => run(() => feishuSyncNow(t.table_id), (r) => r.ok && setMsg({ kind: "ok", text: `ดึง "${t.name}" แล้ว ${r.results[0]?.fetched ?? 0} เรคคอร์ด` }))}>
                      ดึงเดี๋ยวนี้
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400">ยังไม่มีตาราง — กด "โหลดรายชื่อตารางจาก Base" (ต้องเชื่อม Base สำเร็จก่อน)</p>
      )}

      <p className="text-[11px] leading-relaxed text-gray-400">
        การซิงก์เป็นทางเดียว (Base → OA) เท่านั้น ระบบนี้ไม่มีการเขียน/แก้/ลบข้อมูลใน Feishu Base
        · ถ้าทดสอบแล้วขึ้น error เรื่องสิทธิ์ แปลว่าแอป "OA Base Reader" ยังรอแอดมินอนุมัติ หรือยังไม่ถูกเพิ่มเข้า Base
      </p>
    </div>
  );
}
