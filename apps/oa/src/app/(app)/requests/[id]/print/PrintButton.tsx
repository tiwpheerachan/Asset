"use client";

import { useT } from "@/components/I18nProvider";

export default function PrintButton() {
  const t = useT();
  return (
    <button className="btn-primary" onClick={() => window.print()}>
      {t("print.button")}
    </button>
  );
}
