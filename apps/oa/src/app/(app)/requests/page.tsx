import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listRequests, listTemplates, subordinatesOf } from "@/lib/queries";
import RequestTable from "@/components/RequestTable";
import { PageShell, PageTitle } from "@/components/layout-bits";
import { IconDownload, IconSearch } from "@/components/icons";
import { getT } from "@/lib/i18n/server";
import { STATUS_LABEL } from "@/lib/types";
import type { RequestStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "list.tab.all" },
  { key: "awaiting", label: "list.tab.awaiting" },
  { key: "mine", label: "list.tab.mine" },
  { key: "team", label: "list.tab.team", managerOnly: true },
] as const;

export default async function RequestListPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string; status?: string; tpl?: string; q?: string;
    from?: string; to?: string; page?: string;
  }>;
}) {
  const user = await requireUser();
  const t = await getT();
  const sp = await searchParams;
  // เห็นแท็บ "ทีมของฉัน" ได้ถ้าดูแลแผนก หรือมีคนรายงานตรงกับตนอยู่ในสายบังคับบัญชา
  // — หัวหน้าที่คุมคนข้ามแผนกไม่ได้ผูกแผนกไว้ แต่ก็ต้องมีที่ให้ดูงานของทีมตัวเอง
  const isManager =
    (user.role === "MANAGER" && user.department_id !== null) ||
    (await subordinatesOf(user.id)).length > 0;
  const tabs = TABS.filter((x) => !("managerOnly" in x) || isManager);
  const tab = tabs.some((x) => x.key === sp.tab) ? sp.tab! : "all";

  const PER_PAGE = 50;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const filter = {
    tab: tab as "all" | "awaiting" | "mine" | "team" | "clearing",
    status: sp.status && sp.status in STATUS_LABEL ? sp.status : undefined,
    templateId: sp.tpl ? Number(sp.tpl) : undefined,
    q: sp.q,
    from: sp.from,
    to: sp.to,
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  };
  const { rows: requests, total } = await listRequests(user, filter);
  const templates = await listTemplates();
  // ตัวกรองพวกนี้ทำงานอยู่ในหลังบ้านมาตลอด แต่ไม่เคยมีปุ่มให้กด —
  // ค่าถูกอ่านจาก query string แล้วส่งต่อเป็น hidden input เท่านั้น
  const activeFilters = [sp.status, sp.tpl, sp.from, sp.to].filter(Boolean).length;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    // เปลี่ยนตัวกรองเมื่อไหร่ ให้กลับไปหน้าแรกเสมอ ไม่งั้นจะค้างอยู่หน้า 7 ของผลลัพธ์ที่มี 2 หน้า
    const merged = {
      tab, status: sp.status, tpl: sp.tpl, q: sp.q, from: sp.from, to: sp.to,
      page: undefined as string | undefined, ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/requests?${p.toString()}`;
  };
  const exportUrl = (() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab, status: sp.status, tpl: sp.tpl, q: sp.q, from: sp.from, to: sp.to }))
      if (v) p.set(k, v);
    return `/api/requests/export?${p.toString()}`;
  })();

  return (
    <PageShell>
    <div className="space-y-6">
      <PageTitle title={t("nav.center")} subtitle={t("workspace.listHint")} />
      {/*
        แท็บ ค้นหา และตัวกรอง อยู่แถวเดียวกันทั้งหมด

        เดิมเป็นสามแถบซ้อนกันสูงรวมเกือบ 250px ทั้งที่ทำเรื่องเดียวกันคือ "จะดูรายการ
        ชุดไหน" — และเป็นสองฟอร์มแยกกัน ค้นหาทีหนึ่งกรองทีหนึ่ง ต้องกดสองปุ่ม
        ตอนนี้เป็นฟอร์มเดียว กดปุ่มเดียวได้ทั้งค้นหาและกรองพร้อมกัน

        ป้ายกำกับเหนือช่อง (สถานะ/ประเภท/ตั้งแต่/ถึง) ถูกตัดออก เพราะตัวเลือกแรก
        ของแต่ละช่องบอกอยู่แล้วว่าเป็นช่องอะไร ("ทุกสถานะ" "ทุกประเภท") —
        ส่วนโปรแกรมอ่านหน้าจอยังได้ชื่อช่องครบผ่าน aria-label
      */}
      {/* แถบเดียว ขอบเดียว ไม่มีเส้นคั่นข้างใน — ของกรองชุดนี้ทำงานร่วมกันเป็นชุดเดียว
          การให้แต่ละอันเป็นแคปซูลลอยของตัวเองทำให้มีกรอบมนซ้อนกันเจ็ดชั้นในแถวเดียว
          ส่วนเส้นคั่นก็เป็นเส้นอีกหกเส้นที่ไม่ได้บอกอะไรเพิ่ม — ระยะห่างบอกแทนได้อยู่แล้ว
          จอเล็กปล่อยให้ตกบรรทัดได้ · จอใหญ่แถวเดียว แคบจริง ๆ ค่อยเลื่อนแนวนอน */}
      <form action="/requests" className="bar flex-wrap lg:flex-nowrap">
        <input type="hidden" name="tab" value={tab} />

        <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto rounded-full
                        bg-surface px-1.5 ring-1 ring-border">
          {tabs.map((tabDef) => (
            <Link
              key={tabDef.key}
              href={qs({ tab: tabDef.key })}
              aria-current={tab === tabDef.key ? "page" : undefined}
              className={`flex h-8 items-center whitespace-nowrap rounded-full px-3 text-[13px] transition ${
                tab === tabDef.key
                  ? "bg-primary-soft font-medium text-primary-text"
                  : "text-text-soft hover:bg-surface-2 hover:text-text"
              }`}
            >
              {t(tabDef.label)}
            </Link>
          ))}
        </div>

        <div className="relative min-w-[170px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <IconSearch className="h-4 w-4" />
          </span>
          <input name="q" aria-label={t("list.searchPlaceholder")} defaultValue={sp.q ?? ""}
                 className="bar-field w-full pl-10"
                 placeholder={t("list.searchPlaceholder")} />
        </div>

        {/* ความกว้างคงที่ ไม่ให้ยืดตามตัวเลือกที่ยาวที่สุด — ชื่อฟอร์มยาว ๆ ใบเดียว
            ดันให้ช่องกรองกว้างจนแถวตกบรรทัดได้ */}
        <select name="status" aria-label={t("table.status")} defaultValue={sp.status ?? ""}
                className="bar-field w-32 shrink-0">
          <option value="">{t("list.filter.anyStatus")}</option>
          {(Object.keys(STATUS_LABEL) as RequestStatus[]).map((st) => (
            <option key={st} value={st}>{t(`status.${st}`)}</option>
          ))}
        </select>

        <select name="tpl" aria-label={t("detail.type")} defaultValue={sp.tpl ?? ""}
                className="bar-field w-36 shrink-0">
          <option value="">{t("list.filter.anyType")}</option>
          {templates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
          ))}
        </select>

        {/* เหลือช่องวันที่ช่องเดียว = "ตั้งแต่วันไหน" ซึ่งเป็นการกรองที่คนใช้จริงเกือบทุกครั้ง
            (ขอดูของตั้งแต่ต้นเดือน / ตั้งแต่ไตรมาสนี้) ส่วน "ถึงวันที่" แทบไม่มีใครใส่
            แต่กินความกว้างเท่ากัน — ลิงก์เก่าที่มี ?to= ในนั้นยังกรองได้เหมือนเดิม
            เพราะฝั่งฐานข้อมูลยังรับพารามิเตอร์นี้อยู่ */}
        <input type="date" name="from" aria-label={t("list.filter.from")} defaultValue={sp.from ?? ""}
               title={t("list.filter.from")}
               className="bar-field w-36 shrink-0" />
        {sp.to && <input type="hidden" name="to" value={sp.to} />}

        {activeFilters > 0 && (
          <Link href={qs({ status: undefined, tpl: undefined, from: undefined, to: undefined })}
                className="flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4
                           text-xs text-muted ring-1 ring-border hover:text-text">
            {t("list.filter.clear", { n: activeFilters })}
          </Link>
        )}

        {/* ปุ่มเป็นไอคอน — ข้อความยาวกว่าปุ่มที่จำเป็น และแถวนี้มีของเยอะอยู่แล้ว
            ยังมี title กับ aria-label ครบ คนที่ใช้โปรแกรมอ่านหน้าจอจึงไม่เสียอะไร */}
        <button
          className="btn-primary h-11 w-11 shrink-0 rounded-full px-0"
          title={t("list.filter.apply")}
          aria-label={t("list.filter.apply")}
        >
          <IconSearch className="h-[18px] w-[18px]" />
        </button>

        {/* จำนวนรายการเอาออก — ตารางข้างล่างบอกอยู่แล้วว่ามีกี่แถว และเลขหน้าบอกซ้ำอีกที
            เมื่อผลลัพธ์ยาวเกินหนึ่งหน้า */}
        <a
          className="btn btn-ghost ml-auto h-11 w-11 shrink-0 rounded-full px-0"
          href={exportUrl}
          title={t("list.exportCsv")}
          aria-label={t("list.exportCsv")}
        >
          <IconDownload className="h-[18px] w-[18px]" />
        </a>
      </form>

      {tab === "team" && user.department && (
        <p className="-mt-3 text-sm text-muted">{t("list.teamHint", { dept: user.department })}</p>
      )}

      <RequestTable requests={requests} />

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2 text-sm">
          <Link
            href={qs({ page: page > 2 ? String(page - 1) : undefined })}
            aria-disabled={page === 1}
            className={`btn btn-ghost text-xs ${page === 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            {t("common.prev")}
          </Link>
          <span className="text-muted">{t("common.pageOf", { page, pages })}</span>
          <Link
            href={qs({ page: String(page + 1) })}
            aria-disabled={page >= pages}
            className={`btn btn-ghost text-xs ${page >= pages ? "pointer-events-none opacity-40" : ""}`}
          >
            {t("common.next")}
          </Link>
        </div>
      )}
    </div>
    </PageShell>
  );
}
