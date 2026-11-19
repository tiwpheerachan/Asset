"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** รันในหน้าลูก (โหมด embed) — ส่งชื่อหน้า + ที่อยู่ปัจจุบันกลับไปให้แท็บฝั่งพ่อ */
export default function EmbedReporter() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const tabId = search.get("_tab");
    if (!tabId || window.parent === window) return;
    const sp = new URLSearchParams(search.toString());
    sp.delete("embed");
    sp.delete("_tab");
    const qs = sp.toString();
    const url = pathname + (qs ? `?${qs}` : "");
    const post = () => {
      try {
        window.parent.postMessage({ type: "oa-tab", tabId, title: document.title, url }, window.location.origin);
      } catch { /* ignore */ }
    };
    post();
    const t = setTimeout(post, 400); // รอให้ <title> ของหน้าตั้งค่าเสร็จ
    return () => clearTimeout(t);
  }, [pathname, search]);

  return null;
}
