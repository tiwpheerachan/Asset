import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMenuAccess } from "@/lib/auth";
import { getUser, getUserActivity, fillMissingAvatarsFromDirectory } from "@/lib/queries";
import { updateUserMenuAccessAction } from "@/lib/actions";
import { rolesAreLocal } from "@/lib/sso/config";
import { PageShell, PageTitle, SectionCard } from "@/components/layout-bits";
import { Avatar } from "@/components/ui";
import MenuAccessForm from "@/components/MenuAccessForm";
import { ROLE_LABEL } from "@/lib/types";
import { parseMenuAccess, roleDefaultMenuKeys } from "@/lib/menu-access";

export const dynamic = "force-dynamic";

const STATUS_TH: Record<string, string> = {
  DRAFT: "ร่าง", PENDING: "รออนุมัติ", PRELIM_APPROVED: "อนุมัติเบื้องต้น",
  APPROVED: "อนุมัติแล้ว", REJECTED: "ไม่อนุมัติ", RETURNED: "ตีกลับ", CANCELLED: "ยกเลิก",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-sm text-text">{children}</div>
    </div>
  );
}

export default async function UserProfilePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await requireMenuAccess("users");
  const { id } = await params;
  const uid = Number(id);
  if (!Number.isInteger(uid) || uid <= 0) notFound();

  const user = await getUser(uid);
  if (!user) notFound();
  await fillMissingAvatarsFromDirectory([user]);

  const activity = await getUserActivity(uid);
  const canEdit = rolesAreLocal();
  const explicit = parseMenuAccess(user.menu_access);
  const initialKeys = explicit ?? roleDefaultMenuKeys(user.role);
  const sp = await searchParams;

  const flash =
    sp.ok === "perm" ? { tone: "ok", msg: "บันทึกสิทธิ์เมนูแล้ว" }
    : sp.err === "self" ? { tone: "err", msg: "ปรับสิทธิ์ตัวเองไม่ได้: ต้องคงเมนู “ผู้ใช้และสิทธิ์” ไว้เสมอ" }
    : sp.err ? { tone: "err", msg: "บันทึกไม่สำเร็จ" }
    : null;

  return (
    <PageShell>
      <div className="space-y-5">
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          ← กลับรายชื่อผู้ใช้
        </Link>
        <PageTitle title={user.name} subtitle={user.email} />

        {flash && (
          <div className={`rounded-lg px-4 py-2 text-sm ${flash.tone === "ok" ? "bg-ok/10 text-ok" : "bg-no/10 text-no"}`}>
            {flash.msg}
          </div>
        )}

        {/* โปรไฟล์ */}
        <SectionCard title="โปรไฟล์">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar name={user.name} size={72} src={user.avatar_url || undefined} />
            <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Field label="อีเมล">{user.email}</Field>
              <Field label="แผนก">{user.department || <span className="text-muted">—</span>}</Field>
              <Field label="ตำแหน่ง">{user.position || <span className="text-muted">—</span>}</Field>
              <Field label="บทบาท">{ROLE_LABEL[user.role]}</Field>
              <Field label="การเข้าระบบ">{user.sso_sub ? "ระบบกลาง (SSO)" : "รหัสผ่านในแอป"}</Field>
              <Field label="สถานะ">
                {user.active ? <span className="text-ok">ใช้งาน</span> : <span className="text-muted">ปิดใช้งาน</span>}
              </Field>
            </div>
          </div>
        </SectionCard>

        {/* ประวัติกิจกรรม */}
        <SectionCard title="ประวัติกิจกรรม" hint={`ยื่น ${activity.submitted} ใบ · ดำเนินการอนุมัติ ${activity.acted} ครั้ง`}>
          {activity.recent.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">ยังไม่มีคำขอ</div>
          ) : (
            <ul className="divide-y divide-border">
              {activity.recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <Link href={`/requests/${r.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text">{r.title || r.doc_no}</div>
                    <div className="text-[11px] text-muted">{r.doc_no} · {r.created_at?.slice(0, 10)}</div>
                  </Link>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-text-soft">
                    {STATUS_TH[r.status] ?? r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* สิทธิ์เห็นเมนู */}
        <SectionCard
          title="สิทธิ์เห็นเมนู (แท็บที่เข้าถึงได้)"
          hint="กำหนดว่าคนนี้เห็น/เปิดเมนูไหนได้บ้าง · การแก้ไขข้อมูล (จัดการ) ยังต้องเป็นผู้ดูแลระบบ"
        >
          {canEdit ? (
            <MenuAccessForm
              userId={user.id}
              role={user.role}
              initialKeys={initialKeys}
              initialCustom={explicit !== null}
              action={updateUserMenuAccessAction}
            />
          ) : (
            <p className="text-sm text-muted">ระบบกลางคุมสิทธิ์อยู่ — แก้ที่นี่ไม่ได้ (ตั้ง SSO_CENTRAL_ROLES=false เพื่อให้ OA คุมเอง)</p>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}
