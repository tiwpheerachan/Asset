import TemplateGlyph from "@/components/TemplateGlyph";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  listReferenceable,
  getActiveFields,
  getAttachments,
  getFlowNodes,
  getRequest,
  getTemplate,
  getUser,
  listActiveUsers,
} from "@/lib/queries";
import { approverPhotos } from "@/lib/approver-photos";
import RequestForm from "@/components/RequestForm";
import { getT } from "@/lib/i18n/server";
import { PageShell } from "@/components/layout-bits";

export const dynamic = "force-dynamic";

export default async function EditRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const t = await getT();
  const { id } = await params;
  const req = await getRequest(Number(id));
  if (!req) notFound();

  const isOwner = req.requester_id === user.id || user.role === "ADMIN";
  if (!isOwner || (req.status !== "DRAFT" && req.status !== "RETURNED")) {
    redirect(`/requests/${req.id}`);
  }

  const template = (await getTemplate(req.template_id));
  if (!template) notFound();

  // สายอนุมัติคิดจากผู้จัดทำเอกสาร ไม่ใช่คนที่กำลังแก้ (admin แก้แทนได้)
  const requester = (await getUser(req.requester_id));
  if (!requester) notFound();

  const nodes = await getFlowNodes(template.id);
  const users = await listActiveUsers();
  const avatars = await approverPhotos(nodes, (await users));

  return (
    <PageShell>
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-text">{t("form.editTitle", { docNo: req.doc_no })}</h1>
        <p className="text-sm text-muted">
          <TemplateGlyph icon={template.icon} size={20} /> {template.name}
          {" · "}
          {req.status === "RETURNED" ? t("form.editReturned") : t("form.editDraft")}
        </p>
      </div>

      <RequestForm
        template={template}
        fields={(await getActiveFields(template.id))}
        nodes={nodes}
          avatars={avatars}
        users={users}
          refs={(await listReferenceable(user))}
        requester={requester}
        request={req}
        files={(await getAttachments(req.id))}
      />
    </div>
    </PageShell>
  );
}
