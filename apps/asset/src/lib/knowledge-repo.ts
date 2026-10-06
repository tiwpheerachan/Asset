import 'server-only';
import { pool } from './db';
import { ensureSchema } from './fa-repo';
import { generateKnowledge, type KnowledgeArticle } from './deepseek';

export interface KnowledgeRow {
  id: string;
  topic: string;
  title: string;
  summary: string;
  content: string;
  sources: KnowledgeArticle['sources'];
  tags: string[];
  model: string;
  generatedAt: string;
  updatedAt: string;
}

const slug = (s: string) =>
  'kb-' + s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 60) ||
  'kb-' + Date.now().toString(36);

export async function listKnowledge(): Promise<KnowledgeRow[]> {
  await ensureSchema();
  const r = await pool().query(
    `SELECT id, topic, title, summary, content, sources, tags, model, generated_at, updated_at
       FROM fa.knowledge ORDER BY updated_at DESC`,
  );
  return r.rows.map((x) => ({
    id: x.id, topic: x.topic, title: x.title, summary: x.summary, content: x.content,
    sources: x.sources ?? [], tags: x.tags ?? [], model: x.model,
    generatedAt: x.generated_at, updatedAt: x.updated_at,
  }));
}

/** สร้าง/อัปเดตบทความด้วย AI แล้วบันทึก (topic เดิม = อัปเดตทับ) */
export async function generateAndSave(topic: string, tags: string[] = []): Promise<KnowledgeRow> {
  await ensureSchema();
  const art = await generateKnowledge(topic);
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const id = slug(topic);
  await pool().query(
    `INSERT INTO fa.knowledge (id, topic, title, summary, content, sources, tags, model, generated_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       title=excluded.title, summary=excluded.summary, content=excluded.content,
       sources=excluded.sources, tags=excluded.tags, model=excluded.model, updated_at=now()`,
    [id, topic, art.title, art.summary, art.content, JSON.stringify(art.sources), JSON.stringify(tags), model],
  );
  const rows = await pool().query(`SELECT * FROM fa.knowledge WHERE id=$1`, [id]);
  const x = rows.rows[0];
  return {
    id: x.id, topic: x.topic, title: x.title, summary: x.summary, content: x.content,
    sources: x.sources ?? [], tags: x.tags ?? [], model: x.model,
    generatedAt: x.generated_at, updatedAt: x.updated_at,
  };
}

export async function deleteKnowledge(id: string): Promise<void> {
  await pool().query(`DELETE FROM fa.knowledge WHERE id=$1`, [id]);
}
