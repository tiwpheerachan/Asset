"use client";

import { useState, useTransition } from "react";
import { saveCompanyProfile } from "@/lib/actions";

type Form = Record<string, string>;

const FIELDS: { k: string; label: string; full?: boolean; mono?: boolean }[] = [
  { k: "name_th", label: "ชื่อบริษัท (ไทย)" },
  { k: "name_en", label: "ชื่อบริษัท (อังกฤษ)" },
  { k: "tax_id", label: "เลขประจำตัวผู้เสียภาษี", mono: true },
  { k: "branch", label: "สาขา" },
  { k: "address", label: "ที่อยู่", full: true },
  { k: "phone", label: "โทรศัพท์" },
  { k: "email", label: "อีเมล" },
  { k: "website", label: "เว็บไซต์" },
  { k: "authorized_signer", label: "ผู้มีอำนาจลงนาม" },
  { k: "footer_note", label: "หมายเหตุท้ายเอกสาร", full: true },
];

export default function CompanyForm({ initial }: { initial: Form }) {
  const [form, setForm] = useState<Form>(initial);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (k: string, v: string) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const onImg = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) { alert("ไฟล์ใหญ่เกิน 400KB — ใช้รูปเล็กลง"); return; }
    const r = new FileReader();
    r.onload = () => set(k, String(r.result));
    r.readAsDataURL(file);
  };

  const submit = () => start(async () => { await saveCompanyProfile(form); setSaved(true); });

  const ImgField = ({ k, label }: { k: string; label: string }) => (
    <div>
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50">
          {form[k] ? <img src={form[k]} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-[11px] text-gray-400">ไม่มีรูป</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="btn btn-ghost h-9 cursor-pointer text-sm">
            อัปโหลดรูป<input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={onImg(k)} />
          </label>
          {form[k] && <button type="button" className="text-left text-xs text-red-600 hover:underline" onClick={() => set(k, "")}>ลบรูป</button>}
          <span className="text-[11px] text-gray-400">PNG/JPG/SVG · ≤400KB</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {saved && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">บันทึกข้อมูลกิจการแล้ว</div>}

      <div className="grid gap-4 md:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.k} className={f.full ? "md:col-span-2" : ""}>
            <label className="mb-1 block text-xs text-gray-500">{f.label}</label>
            <input className={`input w-full ${f.mono ? "font-mono" : ""}`} value={form[f.k] || ""}
              maxLength={f.k === "tax_id" ? 13 : undefined}
              onChange={(e) => set(f.k, f.k === "tax_id" ? e.target.value.replace(/\D/g, "") : e.target.value)} />
          </div>
        ))}
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-gray-700">โลโก้และตราประทับ</p>
        <div className="grid gap-6 md:grid-cols-2">
          <ImgField k="logo" label="โลโก้บริษัท" />
          <ImgField k="stamp" label="ตราประทับ / ตรายาง" />
        </div>
      </div>

      <div className="flex justify-end">
        <button className="btn btn-primary" disabled={pending} onClick={submit}>{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>
    </div>
  );
}
