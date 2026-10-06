import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  listActiveTemplates,
  listAwaitingMe,
  listCategories,
  listMyOpenRequests,
  listPendingClearance,
  listUnreadCc,
  templateReadiness,
} from "@/lib/queries";
import { getT } from "@/lib/i18n/server";
import { EmptyState, PageShell, SectionCard, StatTile } from "@/components/layout-bits";
import TemplateCatalog from "@/components/TemplateCatalog";
import QueueList from "@/components/QueueList";
import { clearStatus } from "@/lib/clearing";
import { IconCheckCircle, IconInbox, IconSearch, IconSend } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * หน้าแรก = แคตตาล็อกฟอร์มทั้งหมด (แบบเดียวกับแท็บ "ส่งคำขอ" ของ Lark)
 *
 * จัดเป็นหัวข้อหมวดแล้ววางการ์ดใต้หัวข้อ แทนที่จะมีคอลัมน์หมวดให้คลิกกรอง
 * เพราะฟอร์มในองค์กรมีไม่กี่สิบใบ การเห็นทั้งหมดในหน้าเดียวหาเร็วกว่าการไล่คลิกทีละหมวด
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  // ชื่อในระบบกลางพ่วงตำแหน่งมาด้วย ("ชื่อ (Assistant Project Manager)")
  // คำทักทายเอาแค่ชื่อพอ ตำแหน่งไม่ได้ช่วยอะไรตรงนี้และทำให้หัวเรื่องยาวเกินบรรทัด
  const shortName = user.name.replace(/\s*\(.*\)\s*$/, "").trim() || user.name;
  const t = await getT();
  const sp = await searchParams;

  const all = await listActiveTemplates();
  const problems = await templateReadiness();
  const awaiting = await listAwaitingMe(user.id);
  const unreadCc = await listUnreadCc(user.id);
  const mine = await listMyOpenRequests(user.id);
  /**
   * ทั้งสามใบนับ "จำนวนเอกสาร" ไม่ใช่จำนวนแถวในคิว
   *
   * เอกสารใบเดียวโผล่ในคิวได้หลายแถว (อยู่ในขั้นเดียวกันหลายที่ หรือยื่นเองแล้ว
   * อยู่ในสายอนุมัติของตัวเองด้วย) ถ้านับแถวตรง ๆ เลขบนการ์ดจะมากกว่าจำนวนใบจริง
   * แล้วกดเข้าไปเจอรายการสั้นกว่าที่การ์ดบอก ซึ่งอ่านเหมือนระบบทำข้อมูลหาย
   */
  const awaitingIds = new Set(awaiting.map((r) => r.id));
  const mineIds = new Set(mine.map((r) => r.id));
  const everything = new Set([...awaitingIds, ...mineIds]).size;
  // อนุมัติแล้วแต่ยังไม่ได้ตั้งเบิกใน OA — งานที่ทุกคนลืมเพราะเอกสารดู "จบ" ไปแล้ว
  const clearing = await listPendingClearance(user, 20);
  const overdue = clearing.filter((r) => clearStatus(r).state === "overdue");

  const q = (sp.q ?? "").trim().toLowerCase();
  const shown = all.filter(
    (x) =>
      !q ||
      x.name.toLowerCase().includes(q) ||
      x.code.toLowerCase().includes(q) ||
      x.description.toLowerCase().includes(q) ||
      // ชื่อหมวดก็เป็นคำที่คนพิมพ์หา ("การเงิน") ไม่ใช่แค่ชื่อฟอร์ม
      (x.category_name ?? "").toLowerCase().includes(q),
  );

  // จัดกลุ่มตามหมวด เรียงตามลำดับที่ผู้ดูแลตั้งไว้ และตัดหมวดที่ไม่มีฟอร์มออก
  const groups = (await listCategories())
    .map((c) => ({ category: c, items: shown.filter((x) => x.category_id === c.id) }))
    .filter((g) => g.items.length > 0);

  const orphans = shown.filter((x) => !groups.some((g) => g.items.includes(x)));
  if (orphans.length) {
    groups.push({
      category: { id: 0, name: t("catalog.uncategorised"), sort_order: 999, active: 1 },
      items: orphans,
    });
  }

  // ช่องค้นหาไปวางในแถวเดียวกับแท็บหมวด — ทั้งคู่คือเครื่องมือกรองรายการเดียวกัน
  // แยกคนละบรรทัดทำให้ดูเหมือนเป็นคนละเรื่องและกินความสูงเพิ่มโดยไม่ได้อะไร
  const searchBox = (
    <form action="/" className="flex min-w-0 flex-1 items-center gap-2">
      {/* ช่องค้นหายืดเต็มที่ว่างที่เหลือจากแท็บ — ที่ว่างตรงกลางแถวไม่ได้ทำหน้าที่อะไร
          เอามาให้ช่องกรอกดีกว่า ชื่อฟอร์มยาว ๆ จะได้พิมพ์แล้วเห็นครบ */}
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <IconSearch className="h-4 w-4" />
        </span>
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          // โค้งเต็มความสูงให้เข้าชุดกับปุ่มค้นหาที่อยู่ติดกัน — สองอันนี้ทำงานเป็นชิ้นเดียว
          className="input h-11 rounded-full pl-9 pr-4 text-sm"
          placeholder={t("catalog.searchPlaceholder")}
          aria-label={t("catalog.searchPlaceholder")}
        />
      </div>
      <button
        type="submit"
        className="btn-icon h-11 w-11 shrink-0 bg-primary text-white ring-0 hover:bg-primary hover:text-white"
        aria-label={t("common.search")}
        title={t("common.search")}
      >
        <IconSearch className="h-4 w-4" />
      </button>
      {q && (
        <Link href="/" className="whitespace-nowrap text-sm text-muted hover:text-text hover:underline">
          {t("common.clear")}
        </Link>
      )}
    </form>
  );

  return (
    <PageShell>
      <div className="space-y-7">
        {/* คำทักทายบรรทัดเดียว — ชื่อในระบบพ่วงตำแหน่งยาวมาก ถ้าใส่ทั้งก้อนในหัวเรื่อง
            ขนาด 30px จะกินไปทั้งบรรทัดโดยไม่ได้บอกอะไรที่ต้องลงมือทำ */}
        <h1 className="text-xl font-semibold text-text sm:text-2xl">
          {t("home.greeting", { name: shortName })}
        </h1>

        {/*
          (บันทึกเก่า) ตัวเลขสรุปสามใบเคยถูกเอาออก — มันซ้ำกับของที่อยู่ข้างล่างทุกตัว
          "รอฉันอนุมัติ 2" กับ "คำขอของฉัน 2" เป็นเลขเดียวกับป้ายบนการ์ดถัดลงไปสองนิ้ว
          และซ้ำกับตัวเลขบนเมนูซ้ายอีกที ส่วน "ส่งคำขอ 3" นับจำนวนฟอร์ม ไม่ใช่จำนวนงาน
          แต่วางอยู่แถวเดียวกับอีกสองใบจนอ่านเหมือนมีงานค้าง 3 ชิ้น

          ผลคือต้องเลื่อนผ่านกล่องสูงร้อยกว่าพิกเซลสามใบ กว่าจะถึงรายการงานจริง
        */}
        {/* งานที่ค้างอยู่ที่ตัวเรามาก่อนเสมอ — เปิดแอปมาต้องเห็นว่า "ต้องทำอะไร"
            ไม่ใช่ "มีฟอร์มอะไรให้เลือก" การส่งคำขอเป็นงานที่ตั้งใจมาทำอยู่แล้ว
            แต่งานที่รอเราอนุมัติคือสิ่งที่ถ้าไม่เห็นก็ลืม แล้วเอกสารก็ดองอยู่อย่างนั้น */}
        {/* สามใบนี้คือ "งานของฉัน" ทั้งหมด แบ่งตามบทบาทที่เรามีต่อเอกสาร —
            กดใบไหนก็เข้าไปที่รายการเต็มของใบนั้น ไม่ต้องมีรายการย่อซ้ำอยู่บนหน้าแรก */}
        <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {/* สีประจำใบ: รออนุมัติ = เหลือง (ต้องลงมือ) · ของฉัน = คราม (เรื่องของเรา)
              ทั้งหมด = เขียวน้ำทะเล (ภาพรวม ไม่ใช่งานค้าง) — คนละสีเพราะคนละงาน */}
          <StatTile
            label={t("home.card.toApprove")}
            hint={t("home.card.toApproveHint")}
            value={awaitingIds.size}
            href="/requests?tab=awaiting"
            accent="amber"
            dim={awaitingIds.size === 0}
            icon={<IconCheckCircle className="h-[18px] w-[18px]" />}
          />
          <StatTile
            label={t("home.card.mine")}
            hint={t("home.card.mineHint")}
            value={mineIds.size}
            href="/requests?tab=mine"
            accent="primary"
            dim={mineIds.size === 0}
            icon={<IconSend className="h-[18px] w-[18px]" />}
          />
          <StatTile
            label={t("home.card.all")}
            hint={t("home.card.allHint")}
            value={everything}
            href="/requests"
            accent="teal"
            dim={everything === 0}
            icon={<IconInbox className="h-[18px] w-[18px]" />}
          />
        </div>

        {(unreadCc.length > 0 || clearing.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {clearing.length > 0 && (
              <SectionCard
                title={t("clear.title")}
                hint={overdue.length > 0 ? t("home.clearOverdue", { n: overdue.length }) : t("home.clearHint")}
                action={
                  <span className={`badge ${overdue.length > 0 ? "tone-rose" : "tone-amber"}`}>
                    {clearing.length}
                  </span>
                }
              >
                <QueueList items={clearing} variant="outgoing" />
              </SectionCard>
            )}

            {unreadCc.length > 0 && (
              <SectionCard
                title={t("home.stat.cc")}
                hint={t("home.stat.ccHint")}
                action={<span className="badge tone-sky">{unreadCc.length}</span>}
              >
                <QueueList items={unreadCc} variant="incoming" max={3} moreHref="/requests" />
              </SectionCard>
            )}
          </div>
        )}

        {/*
          แถบ "ใช้ล่าสุด" ถูกเอาออก — มันหยิบการ์ดชุดเดียวกับแคตตาล็อกที่อยู่ถัดลงไป
          ขึ้นมาโชว์ซ้ำ องค์กรนี้มีฟอร์มไม่กี่ใบ ทั้งหมดอยู่ในหน้าจอเดียวกันอยู่แล้ว
          การมีแถวลัดจึงไม่ได้ประหยัดการค้นหา แต่เพิ่มความสูงและทำให้เห็นชื่อฟอร์ม
          เดียวกันสองรอบ ซึ่งอ่านแล้วสับสนว่าเป็นคนละใบกันหรือเปล่า
        */}

        {shown.length === 0 ? (
          <EmptyState>
            {all.length === 0 ? (
              <div className="space-y-3">
                <p>{t("catalog.empty")}</p>
                {user.role === "ADMIN" && (
                  <Link href="/admin/forms" className="btn btn-primary inline-flex">
                    {t("catalog.createFirst")}
                  </Link>
                )}
              </div>
            ) : (
              t("catalog.notFound")
            )}
          </EmptyState>
        ) : (
          <TemplateCatalog
            manageLabel={t("catalog.setup")}
            search={searchBox}
            groups={groups.map((g) => ({
              id: g.category.id,
              name: g.category.name,
              count: g.items.length,
            }))}
            items={groups.flatMap((g) =>
              g.items.map((tpl) => ({
                id: tpl.id,
                code: tpl.code,
                name: tpl.name,
                icon: tpl.icon,
                color: tpl.color,
                description: tpl.description,
                categoryId: g.category.id,
                href: problems.has(tpl.id) ? undefined : `/requests/new/${tpl.id}`,
                warning: problems.has(tpl.id)
                  ? problems.get(tpl.id)!.map((k) => t(k)).join(" · ")
                  : undefined,
                manageHref: user.role === "ADMIN" ? `/admin/forms/${tpl.id}` : undefined,
              })),
            )}
          />
        )}
      </div>
    </PageShell>
  );
}
