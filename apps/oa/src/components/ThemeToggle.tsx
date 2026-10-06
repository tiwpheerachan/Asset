"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "@/components/icons";
import { useT } from "@/components/I18nProvider";

/** สลับโหมดสว่าง/มืด — จำค่าไว้ใน localStorage และตั้งคลาส dark ที่ <html> */
export default function ThemeToggle() {
  const t = useT();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("ia-theme", next ? "dark" : "light");
    } catch {
      // โหมดส่วนตัวของบางเบราว์เซอร์ปิด localStorage — ไม่ต้องทำอะไร
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn-icon h-9 w-9"
      aria-label={dark ? t("theme.toLight") : t("theme.toDark")}
      title={dark ? t("theme.toLight") : t("theme.toDark")}
    >
      {dark ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
    </button>
  );
}
