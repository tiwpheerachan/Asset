import CopyLink from "@/components/CopyLink";
import TemplateIcon from "@/components/TemplateIcon";
import { IconArchive, IconChevronLeft } from "@/components/icons";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  listReferenceable,
  getActiveFields,
  getFlowNodes,
  getTemplate,
  listActiveUsers,
  countMyDrafts
} from "@/lib/queries";
import { approverPhotos } from "@/lib/approver-photos";
import RequestForm from "@/components/RequestForm";
import { Avatar } from "@/components/ui";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/format";
import { PageShell } from "@/components/layout-bits";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const user = await requireUser();
  const t = await getT();
  const locale = await getLocale();
  const { templateId } = await params;
  const template = await getTemplate(Number(templateId));
  if (!template || !template.active) notFound();

  const now = new Date().toISOString();

  const nodes = await getFlowNodes(template.id);
  const users = await listActiveUsers();
  const avatars = await approverPhotos(nodes, (await users));

  return (
    <PageShell>
      <div className="space-y-6">
        {/* ปุ่มย้อนกลับกับเครื่องมือของฟอร์มอยู่แถวเดียวกัน — เป็นแถบควบคุมของหน้านี้
            ทั้งหมด ไม่ใช่ส่วนหนึ่งของเนื้อหา · ปุ่มบันทึกร่างอยู่นอก <form> แต่สั่งส่งได้
            ด้วยแอตทริบิวต์ form="request-form" ซึ่งเป็นของมาตรฐาน HTML */}
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="btn-ghost inline-flex gap-1.5">
            <IconChevronLeft className="h-4 w-4" />
            {t("catalog.pickOther")}
          </Link>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="submit" form="request-form" name="intent" value="draft" className="btn-ghost">
              {t("form.saveDraft")}
            </button>
            <Link href="/requests?tab=mine&status=DRAFT" className="btn-ghost gap-1.5">
              <IconArchive className="h-4 w-4" />
              {t("form.draftBox")} ({countMyDrafts(user.id)})
            </Link>
            <CopyLink path={`/requests/new/${template.id}`} label={t("form.copyFormLink")} />
          </div>
        </div>

        {/* หัวเรื่องกับผู้กรอกอยู่แถวเดียวกัน — ทั้งคู่คือ "เอกสารนี้คืออะไร ของใคร"
            อ่านคู่กันจบในบรรทัดเดียว ไม่ต้องกวาดสายตาขึ้นลงสองรอบ */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <TemplateIcon code={template.code} icon={template.icon} color={template.color} size={44} />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-text">
                {template.name}
              </h1>
              {template.description && (
                <p className="truncate text-sm text-muted">{template.description}</p>
              )}
            </div>
          </div>

          {/* ข้อมูลประกอบ ไม่ใช่เนื้อหา — ตัวอักษรบางไม่มีกรอบ จะได้ไม่แข่งกับชื่อฟอร์ม
              ซึ่งเป็นสิ่งที่ต้องอ่านก่อนจริง ๆ */}
          <div className="flex shrink-0 items-center gap-2.5">
            <Avatar name={user.name} src={user.avatar_url} size={30} />
            <div className="min-w-0 text-sm leading-snug">
              <div className="truncate text-text-soft">{user.name}</div>
              <div className="text-xs tabular-nums text-muted">
                {t("form.startedAt")} {formatDateTime(now, locale)}
              </div>
            </div>
          </div>
        </div>

        <RequestForm
          template={template}
          fields={(await getActiveFields(template.id))}
          nodes={nodes}
          avatars={avatars}
          users={users}
          refs={(await listReferenceable(user))}
          requester={user}
        />
      </div>
    </PageShell>
  );
}
