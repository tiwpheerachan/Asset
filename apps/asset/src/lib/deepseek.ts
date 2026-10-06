import 'server-only';

/**
 * DeepSeek client — สร้างบทความความรู้สำหรับทีมบัญชี (ฝั่ง server เท่านั้น ถือ API key)
 * หมายเหตุสำคัญ: โมเดลแชตไม่ได้เปิดเว็บสด เนื้อหามาจากความรู้ของโมเดล
 * จึงบังคับให้อ้างอิง "แหล่งทางการของไทย" ตามชื่อ/เลขที่ (กรมสรรพากร, สภาวิชาชีพบัญชี, พ.ร.ฎ.)
 * และติดวันที่ + โมเดล + หมายเหตุให้บัญชีตรวจสอบกับต้นฉบับก่อนใช้จริง
 */
export interface KnowledgeSource {
  name: string; // ชื่อแหล่ง เช่น "กรมสรรพากร"
  reference: string; // เลขที่/มาตรา เช่น "พ.ร.ฎ. (ฉบับที่ 145)"
  url?: string; // เฉพาะโดเมนทางการที่มั่นใจ (rd.go.th, fap.or.th) — อาจว่าง
}
export interface KnowledgeArticle {
  title: string;
  summary: string;
  content: string; // markdown
  sources: KnowledgeSource[];
  confidence: string; // หมายเหตุความเชื่อมั่น/ข้อควรระวัง
}

const SYSTEM_PROMPT = `คุณเป็นผู้เชี่ยวชาญบัญชีและภาษีอากรของไทย โดยเฉพาะทรัพย์สินถาวร ค่าเสื่อมราคา และมาตรฐานการบัญชี
เขียนความรู้ที่ถูกต้อง นำไปใช้ได้จริง สำหรับทีมบัญชีบริษัทในประเทศไทย
กฎ:
- อ้างอิงเฉพาะแหล่งทางการของไทย ระบุชื่อ/เลขที่ให้ชัด (เช่น กรมสรรพากร, ประมวลรัษฎากร มาตรา 65 ทวิ, พระราชกฤษฎีกา ฉบับที่ 145, สภาวิชาชีพบัญชี, TFRS for NPAEs)
- ใส่ url เฉพาะโดเมนทางการที่มั่นใจจริง (rd.go.th, fap.or.th) ถ้าไม่มั่นใจให้เว้นว่าง อย่าแต่ง url ปลอม
- ถ้ากฎหมายมีเงื่อนไขพิเศษ (เช่น SME, เพดานรถยนต์) ให้ระบุ
- ตอบเป็นภาษาไทย
- ตอบเป็น JSON object เท่านั้น ตาม schema: {"title":string,"summary":string,"content":string(markdown),"sources":[{"name":string,"reference":string,"url":string}],"confidence":string}`;

export async function generateKnowledge(topic: string): Promise<KnowledgeArticle> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('ยังไม่ได้ตั้ง DEEPSEEK_API_KEY');
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `หัวข้อ: ${topic}\n` +
            `เขียนบทความความรู้สำหรับทีมบัญชีที่ใช้ "ระบบบริหารทรัพย์สินถาวร" ` +
            `ครอบคลุม: สาระสำคัญ, อายุ/อัตราค่าเสื่อมตามกฎหมาย, เงื่อนไขพิเศษ, และข้อควรระวังในทางปฏิบัติ. ` +
            `content ให้เป็น markdown มีหัวข้อย่อยและ bullet.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2200,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 402 || /insufficient balance/i.test(body)) {
      throw new Error('ยอดเครดิต DeepSeek ไม่พอ — กรุณาเติมเงินในบัญชี DeepSeek แล้วลองใหม่ (บทความที่สร้างไว้ยังอ่านได้ตามปกติ)');
    }
    if (res.status === 401) {
      throw new Error('API key ของ DeepSeek ไม่ถูกต้องหรือหมดอายุ — ตรวจสอบ DEEPSEEK_API_KEY');
    }
    if (res.status === 429) {
      throw new Error('เรียก DeepSeek บ่อยเกินไป (rate limit) — รอสักครู่แล้วลองใหม่');
    }
    throw new Error(`เรียก DeepSeek ไม่สำเร็จ (${res.status})`);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? '{}';
  let parsed: Partial<KnowledgeArticle>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('DeepSeek ตอบไม่เป็น JSON ที่อ่านได้');
  }
  return {
    title: parsed.title || topic,
    summary: parsed.summary || '',
    content: parsed.content || '',
    sources: Array.isArray(parsed.sources) ? parsed.sources.filter((s) => s && s.name) : [],
    confidence: parsed.confidence || '',
  };
}
