"""
Generate src/data/seed-assets.ts from the legacy "Fixed Asset report Group export" Excel.

Usage:
    python3 scripts/seed_from_excel.py path/to/Fixed_Asset_report_Group_export.xlsx

Legacy columns (sheet1):
 A ลำดับที่ | B หมวดหมู่ | C หมวดหมู่ย่อย | D รหัสกลุ่มสินทรัพย์ | E ชื่อสินทรัพย์ | F หน่วย
 G รหัสบาร์โค้ด | H อายุสินทรัพย์ (ปี) | I จำนวน | J ราคาทุนรวม | K มูลค่าซาก
 L มูลค่าบัญชียกมา | M ค่าเสื่อมราคาสะสมยกมา | N ค่าเสื่อมราคาตามช่วงเวลา
 O มูลค่าที่ขาย | P ค่าเสื่อมสะสมตัดขาย | Q มูลค่าบัญชียกไป | R ค่าเสื่อมราคาสะสมยกไป
 S บัญชีสินทรัพย์ | T บัญชีค่าเสื่อมราคา | U บัญชีค่าเสื่อมราคาสะสม

The legacy report does not contain acquisition / ready-for-use dates, so the ready-for-use
date is back-solved from accumulated depreciation at period end (31/12/2026, straight line,
full month). Organisation fields (branch / department / location) are DEMO assignments and
must be replaced with real data before go-live.
"""
import json
import re
import sys
from datetime import date

import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else "Fixed_Asset_report_Group_export_as_of_SHD.xlsx"
OUT = "src/data/seed-assets.ts"
PERIOD_END = date(2026, 12, 31)

SUBCAT = {
    "ตู้ พื้นที่เก็บของ": "FUR-CAB",
    "เก้าอี้ ที่นั่ง": "FUR-CHR",
    "เครื่องตกแต่งสำนักงานอื่น": "FUR-OTH",
    "โต๊ะ": "FUR-TAB",
    "รถบรรทุก": "VEH-TRK",
    "คอมพิวเตอร์ และอุปกรณ์คอมพิวเตอร์": "OFE-COM",
    "เครื่องพิมพ์ และอุปกรณ์การพิมพ์": "OFE-PRT",
    "อุปกรณ์ และเครื่องใช้สำนักงานอื่น": "OFE-OTH",
    "โทรศัพท์มือถือ": "OFE-MOB",
    "ซอฟท์แวร์": "INT-SOF",
}

UNIT = {"เครื่อง": "unit", "ตัว": "piece", "คัน": "vehicle", "สิทธิ": "license"}

WORDS = [
    ("โน้ตบุ๊ค", "Notebook"), ("โน๊ตบุ๊ค", "Notebook"), ("โน้ตบุ๊ก", "Notebook"), ("โน๊ตบุค", "Notebook"),
    ("Nootbook", "Notebook"), ("คอมประกอบ", "Custom PC"), ("คอมพิวเตอร์แบบตั้งโต๊ะ", "Desktop computer"),
    ("คอมพิวเตอร์และอุปกรณ์คอมพิวเตอร์", "Computers & peripherals"), ("คอมพิวเตอร์พร้อมอุปกรร์", "Computer set with accessories"),
    ("คอมพิวเตอร์", "Computer"), ("เครื่องปริ็นเตอร์", "Printer"), ("เครื่องปริ้นท์", "Printer"),
    ("เครื่องปริ้นเอกสาร", "Printer"), ("เครื่องปริ้น", "Printer"), ("ปริ้นเตอร์", "Printer"),
    ("เครื่องพิมพ์เอกสาร", "Printer"), ("เครื่องพิมพ์และอุปกรณ์การพิมพ์", "Printers & printing equipment"),
    ("เครื่องถ่ายเอกสาร", "Photocopier"), ("เครื่องสำรองไฟ", "UPS"), ("ขาตั้งกล้อง", "Tripod"), ("กล้องวงจรปิดแบบ", "CCTV"),
    ("กล้องวงจรปิด", "CCTV camera"), ("กล้องพร้อมอุปกรณ์", "Camera kit"), ("กล้อง", "Camera"),
    ("เลนส์", "Lens"), ("แบตเตอร์", "Battery"), ("ขาตั้งกล้อง", "Tripod"),
    ("เครื่องแคชเชีย-Qashier เครื่อง", "Cashier terminal Qashier"), ("เครื่องแคชเชีย", "Cashier terminal"), ("รถเข็น4ล้อ", "4-wheel trolley"), ("สีดำ", "Black"),
    ("เครื่องกรองน้ำ", "Water purifier"), ("เครื่องปรับอากาศชนิดติดผนัง", "Wall-mounted air conditioner"),
    ("ตู้เคาน์เตอร์", "Counter cabinet"), ("เร้่าเตอร์ใส่ซิม", "SIM router"), ("เร้าเตอร์ใส่ซิม", "SIM router"),
    ("เร้าเตอร์", "Router"), ("โซลิดสเตตไดรฟ์", "Solid state drive "), ("พีซีมินิ", "Mini PC"), ("มินิพีซี", "Mini PC"),
    ("เมนบอร์ด", "Motherboard"), ("อุปกรณ์จ่ายไฟ", "Power supply"), ("การ์ดจอ", "Graphics card"),
    ("การ์ด", "Card "), ("แรมเดสก์ท็อป", "Desktop RAM"), ("แรมคอมพิวเตอร์", "Computer RAM"), ("แรม", "RAM"),
    ("เคส", "Case"), ("คีย์บอร์ด", "Keyboard"), ("ตู้เอกสาร2ลิ้นชัก มีล้อเลื่อนขนาด", "2-drawer mobile pedestal "),
    ("สีขาว", " white"), ("โทรศัพท์", "Mobile phone"), ("อุปกรณ์สำนักงาน (เครื่องใช้ไฟฟ้าอื่น)", "Office equipment (other electrical)"),
    ("อุปกรณ์สำนักงานอื่น", "Other office equipment"), ("เครื่องมือเครื่องใช้", "Tools & equipment"),
    ("เครื่องบันทึกกล้องวงจรปิด", "CCTV recorder"), ("เครื่องบันทึกภาพ", "Video recorder"),
    ("พร้อมอุปกรณ์", " with accessories"), ("ชั้นวางของ4ชั้น ขนาด", "4-tier shelf "), ("ตู้เก็บเอกสาร", "Document cabinet"),
    ("อุปกรณ์รับสัญญาณ", "Signal"), ("ฮาร์ดดิสก์", "Hard disk"), ("เครื่องดับเพลิง", "Fire extinguisher"),
    ("ตู้เก็บของและชั้นวาง", "Storage cabinets & shelves"), ("เก้าอี้สำนักงาน", "Office chair"), ("เก้าอี้", "Chair"),
    ("รุ่น", "model"), ("เครื่องตกแต่งสำนักงาน", "Office furniture"), ("ผ้าม่าน", "Curtains"),
    ("โต๊ะสำนักงาน", "Office desk"), ("รถกระบะบรรทุก", "Pickup truck"), ("โปรแกรมสำเร็จรูป", "Packaged software"),
    ("สี", "colour "), ("นิ้ว", "inch"), ("จำนวน", ""), ("เครื่อง", " units"), ("ชุด", " sets"), ("ตัว", " pcs"),
    ("อุปกรณ์", "equipment"),
]


def en_name(th: str) -> str:
    s = th
    for a, b in WORDS:
        s = s.replace(a, b + " ")
    s = re.sub(r"[฀-๿]+", "", s)  # drop leftover Thai chars
    s = re.sub(r"\s+", " ", s).strip(" -:")
    return s


def months_between(d1: date, d2: date) -> int:
    return (d2.year - d1.year) * 12 + d2.month - d1.month


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    return date(d.year + y, m + 1, 1)


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb.active
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not isinstance(r[0], (int, float)):
            continue
        code = str(r[3]).strip()
        cost = float(r[9] or 0)
        res = float(r[10] or 0)
        life_y = int(r[7] or 5)
        life_m = life_y * 12
        accum_end = float(r[17] or 0)
        monthly = (cost - res) / life_m if life_m else 0
        used = round(accum_end / monthly) if monthly else 0
        used = max(1, min(used, life_m))
        # first depreciation month = period end month - used + 1
        start = add_months(date(PERIOD_END.year, PERIOD_END.month, 1), -used + 1)
        ready = start
        # code like C68-03200001 / C6803200001 => BE 2568 = 2025, MM, DD
        m = re.match(r"C(\d{2})-?(\d{2})(\d{2})\d{4}$", code)
        acq = ready
        if m:
            try:
                d = date(int(m.group(1)) + 2500 - 543, int(m.group(2)), int(m.group(3)))
                acq = d
                ready = d
            except ValueError:
                pass
        out.append({
            "legacyNo": int(r[0]),
            "code": code,
            "nameTh": str(r[4]).strip(),
            "nameEn": en_name(str(r[4]).strip()),
            "subcategoryId": SUBCAT.get(r[2], "OFE-OTH"),
            "unit": UNIT.get(r[5], "unit"),
            "quantity": int(r[8] or 1),
            "cost": round(cost, 2),
            "residual": round(res, 2),
            "lifeYears": life_y,
            "acquisitionDate": acq.isoformat(),
            "readyDate": ready.isoformat(),
            "legacy": {
                "openingNbv": round(float(r[11] or 0), 2),
                "openingAccum": round(float(r[12] or 0), 2),
                "periodDep": round(float(r[13] or 0), 2),
                "closingNbv": round(float(r[16] or 0), 2),
                "closingAccum": round(accum_end, 2),
                "assetAccount": r[18],
                "expenseAccount": r[19],
                "accumAccount": r[20],
            },
        })
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// AUTO-GENERATED by scripts/seed_from_excel.py — do not edit by hand.\n")
        f.write("// Source: Fixed_Asset_report_Group_export_as_of_SHD.xlsx (period 01/01/2026–31/12/2026)\n")
        f.write("import type { LegacyAssetRow } from '@/lib/types';\n\n")
        f.write("export const LEGACY_ASSETS: LegacyAssetRow[] = ")
        f.write(json.dumps(out, ensure_ascii=False, indent=1))
        f.write(";\n")
    print(f"wrote {len(out)} assets -> {OUT}")


if __name__ == "__main__":
    main()
