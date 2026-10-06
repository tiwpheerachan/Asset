import { redirect } from "next/navigation";

/** แคตตาล็อกฟอร์มย้ายไปเป็นหน้าแรกแล้ว — คงเส้นทางเดิมไว้ไม่ให้ลิงก์เก่าพัง */
export default async function NewRequestRedirect({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string }>;
}) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  if (sp.q) p.set("q", sp.q);
  if (sp.cat) p.set("cat", sp.cat);
  const qs = p.toString();
  redirect(qs ? `/?${qs}` : "/");
}
