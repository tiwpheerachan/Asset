import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { PageShell, PageTitle, SectionCard, StatTile } from "@/components/layout-bits";
import { totals, byMonth, byStatus, byForm, recent } from "@/lib/oa-export/stats";

export const dynamic = "force-dynamic";

const TH_MONTH = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const fmtYm = (ym: string) => `${TH_MONTH[Number(ym.slice(4, 6))] ?? ""} ${ym.slice(0, 4)}`;
const statusMeta = (s: string): { label: string; cls: string } => {
  if (/通过|approved/i.test(s)) return { label: `อนุมัติ (${s})`, cls: "bg-green-500" };
  if (/审批中|pending|review/i.test(s)) return { label: `รออนุมัติ (${s})`, cls: "bg-amber-500" };
  if (/撤回|withdraw/i.test(s)) return { label: `ถอน (${s})`, cls: "bg-gray-400" };
  if (/拒绝|reject/i.test(s)) return { label: `ปฏิเสธ (${s})`, cls: "bg-rose-500" };
  if (/删除|delete/i.test(s)) return { label: `ลบ (${s})`, cls: "bg-gray-300" };
  return { label: s, cls: "bg-indigo-400" };
};

export default async function OaOverviewPage() {
  await requireAdmin();
  const [t, months, statuses, forms, recentDocs] = await Promise.all([totals(), byMonth(), byStatus(), byForm(), recent(12)]);
  const maxM = Math.max(1, ...months.map((m) => m.n));
  const totalForStatus = statuses.reduce((a, b) => a + b.n, 0) || 1;

  return (
    <PageShell>
      <PageTitle title="ภาพรวมเอกสาร OA" subtitle="สรุปเอกสารอนุมัติที่ดึงจาก Feishu — ตามเดือน สถานะ และฟอร์ม (ข้อมูลจริงย้อนหลัง)" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="เอกสารทั้งหมด" value={t.total.toLocaleString()} />
        <StatTile label="มีไฟล์แนบ" value={t.with_files.toLocaleString()} />
        <StatTile label="ฟอร์ม" value={String(t.forms)} />
        <StatTile label="ลงบัญชีแล้ว" value={t.posted.toLocaleString()} />
      </div>

      <SectionCard title={`เอกสารเข้าตามเดือน — ${months.length} เดือน (${months[0] ? fmtYm(months[0].ym) : ""} – ${months.length ? fmtYm(months[months.length - 1].ym) : ""})`}>
        <div className="overflow-x-auto">
          <div className="flex min-w-[640px] items-end gap-1" style={{ height: 180 }}>
            {months.map((m) => (
              <div key={m.ym} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${fmtYm(m.ym)} · ${m.n.toLocaleString()} ใบ`}>
                <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100">{m.n}</span>
                <div className="w-full rounded-t bg-gradient-to-t from-indigo-500 to-indigo-400" style={{ height: `${Math.round((m.n / maxM) * 150)}px` }} />
                <span className="origin-top -rotate-45 whitespace-nowrap text-[8px] text-gray-400">{m.ym.slice(4, 6)}/{m.ym.slice(2, 4)}</span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="ตามสถานะ">
          <div className="space-y-2">
            {statuses.map((s) => {
              const meta = statusMeta(s.status);
              const pct = Math.round((s.n / totalForStatus) * 100);
              return (
                <div key={s.status} className="text-sm">
                  <div className="mb-0.5 flex justify-between"><span className="text-gray-600">{meta.label}</span><span className="font-mono text-gray-500">{s.n.toLocaleString()} · {pct}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className={`h-full ${meta.cls}`} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="ตามฟอร์ม">
          <div className="space-y-1.5">
            {forms.map((f) => (
              <div key={f.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-gray-600">{f.name}</span>
                <span className="font-mono text-xs text-gray-500">{f.n.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="เอกสารล่าสุด">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-400"><tr><th className="py-1 pr-3">เลขที่</th><th className="py-1 pr-3">ฟอร์ม</th><th className="py-1 pr-3">ผู้ยื่น</th><th className="py-1 pr-3">วันที่</th><th className="py-1">สถานะ</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {recentDocs.map((d) => (
                <tr key={d.oa_key}>
                  <td className="py-1.5 pr-3 font-mono text-xs text-gray-700">{d.serial}</td>
                  <td className="py-1.5 pr-3 text-gray-600"><span className="block max-w-[14rem] truncate">{d.form}</span></td>
                  <td className="py-1.5 pr-3 text-gray-600">{d.applicant || "—"}</td>
                  <td className="py-1.5 pr-3 text-xs text-gray-400">{d.date}</td>
                  <td className="py-1.5 text-xs text-gray-500">{d.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3"><Link href="/admin/oa-documents" className="text-sm text-indigo-600 hover:underline">ดูเอกสารทั้งหมด →</Link></div>
      </SectionCard>
    </PageShell>
  );
}
