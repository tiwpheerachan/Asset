"use client";

import { useState } from "react";
import TemplateIcon from "@/components/TemplateIcon";
import { useT } from "@/components/I18nProvider";
import { iconValue, parseTemplateIcon, TEMPLATE_ICON_KEYS, TEMPLATE_ICON_PATHS } from "@/lib/template-icon";
import { TEMPLATE_COLORS, TEMPLATE_COLOR_KEYS, templateColor } from "@/lib/types";

/**
 * เลือกไอคอนของฟอร์ม — สีพื้น + ไอคอน หรืออัปโหลดรูปเอง
 *
 * แสดงตัวอย่างจริงข้าง ๆ ตัวเลือกเสมอ เพราะสิ่งที่คนอยากรู้ตอนเลือกคือ "แล้วมันจะ
 * ออกมาหน้าตายังไง" ไม่ใช่ชื่อของไอคอน — เดิมเป็นช่องพิมพ์อีโมจิซึ่งต้องกดบันทึก
 * แล้วกลับไปดูที่หน้าแรกถึงจะเห็นผล
 */
export default function IconPicker({
  code,
  value,
  color,
}: {
  code: string;
  value: string;
  color: string;
}) {
  const t = useT();
  const [icon, setIcon] = useState(value);
  const [tone, setTone] = useState(color);
  const parsed = parseTemplateIcon(icon);

  return (
    <div className="space-y-3">
      {/* ค่าจริงที่ส่งไปกับฟอร์ม — ตัวเลือกด้านล่างเป็นแค่หน้ากาก */}
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="color" value={tone} />

      <div className="flex flex-wrap items-start gap-4">
        <div className="space-y-2 text-center">
          <TemplateIcon code={code} icon={icon} color={tone} size={56} />
          <p className="text-xs text-muted">{t("admin.forms.iconPreview")}</p>
        </div>

        <div className="min-w-0 flex-1 space-y-3 rounded-xl bg-surface-2 p-3">
          <div>
            <div className="label">{t("admin.forms.iconColor")}</div>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTone(c)}
                  aria-label={c}
                  aria-pressed={tone === c}
                  className={`h-7 w-7 rounded-xl ring-offset-2 ring-offset-surface-2 transition
                              ${tone === c ? "ring-2 ring-primary" : ""}`}
                  style={{ backgroundColor: TEMPLATE_COLORS[c] }}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="label">{t("admin.forms.iconPick")}</div>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_ICON_KEYS.map((k) => {
                const on = parsed.kind === "icon" && parsed.key === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setIcon(iconValue(k))}
                    aria-label={k}
                    aria-pressed={on}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition
                                ${on ? "text-white" : "bg-surface text-muted hover:text-text"}`}
                    style={on ? { backgroundColor: templateColor(code, tone) } : undefined}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                         strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
                      {TEMPLATE_ICON_PATHS[k].split(" M").map((d, i) => (
                        <path key={i} d={i === 0 ? d : `M${d}`} />
                      ))}
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="label">{t("admin.forms.iconUpload")}</div>
            {/* อัปโหลดแยกจากปุ่มบันทึกของฟอร์ม เพราะไฟล์ต้องขึ้นเซิร์ฟเวอร์ก่อน
                ถึงจะรู้ชื่อไฟล์ที่จะเก็บลงคอลัมน์ icon */}
            <input
              type="file"
              name="icon_file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="block w-full text-sm file:mr-3 file:rounded-xl file:border-0
                         file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-text-soft"
            />
            <p className="mt-1 text-xs text-muted">{t("admin.forms.iconUploadHint")}</p>
            {parsed.kind === "image" && (
              <button
                type="button"
                onClick={() => setIcon(iconValue("doc"))}
                className="mt-2 text-xs text-no hover:underline"
              >
                {t("admin.forms.iconRemoveImage")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
