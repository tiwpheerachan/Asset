import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { PageShell } from "@/components/layout-bits";
import { IconSearch } from "@/components/icons";

/**
 * ไม่พบสิ่งที่ขอ
 *
 * เจอบ่อยกว่าที่คิด เพราะลิงก์เอกสารถูกส่งต่อกันในแชท แล้วปลายทางถูกยกเลิกไปแล้ว
 * หรือคนกดลิงก์ที่ไม่มีสิทธิ์เห็น — บอกให้ชัดว่า "ไม่มี หรือไม่ได้สิทธิ์" ทั้งสองอย่าง
 * เพราะระบบตั้งใจไม่บอกว่าเอกสารนั้นมีอยู่จริงไหม ถ้าคนถามไม่มีสิทธิ์เห็น
 */
export default async function NotFound() {
  const t = await getT();

  return (
    <PageShell>
      <div className="card mx-auto max-w-lg space-y-4 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <IconSearch />
        </span>

        <div>
          <h1 className="h-card">{t("notFound.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("notFound.body")}</p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/requests" className="btn-primary">
            {t("nav.center")}
          </Link>
          <Link href="/" className="btn-ghost">
            {t("error.home")}
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
