#!/bin/sh
# ยิงให้ prod (shd-oa.onrender.com) ดึงเอกสาร OA จาก Export API เข้ามาเอง
# อ่าน secret จาก .env.local ตอนรัน (ไม่ hardcode รหัสในไฟล์นี้)
ENV="/Users/tiw/Downloads/shd-platform/apps/oa/.env.local"
SECRET=$(sed -n 's/^OA_SYNC_SECRET=//p' "$ENV" | sed 's/[\"'"'"' ]//g')
if [ -z "$SECRET" ]; then echo "$(date) ไม่พบ OA_SYNC_SECRET"; exit 1; fi
echo "$(date) → sync prod..."
curl -fsS -m 290 -X POST "https://shd-oa.onrender.com/api/oa-export/sync?key=$SECRET"
echo ""
