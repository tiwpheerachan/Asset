-- โครงสร้าง schema `fa` (jsonb store) ที่แอป Asset ใช้จริง — รันซ้ำได้ (IF NOT EXISTS)
-- ปกติแอปจะสร้างเองอัตโนมัติ (ensureSchema ใน src/lib/fa-repo.ts); ไฟล์นี้ไว้รันมือด้วย psql
--   psql "$DATABASE_URL" -f apps/asset/db/fa-schema.sql

CREATE SCHEMA IF NOT EXISTS fa;

CREATE TABLE IF NOT EXISTS fa.app_state (
  key text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fa.assets (
  id text PRIMARY KEY, code text, status text, data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS fa.audit_logs     ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.branches       ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.categories     ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.companies      ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.cost_centers   ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.dep_runs       ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.departments    ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.documents      ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.locations      ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.policies       ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.running_numbers( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.users          ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.asset_movements ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.asset_disposals ( id text PRIMARY KEY, data jsonb NOT NULL );
CREATE TABLE IF NOT EXISTS fa.oa_records (
  id text PRIMARY KEY, doc_no text, status text, data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS fa.knowledge (
  id text PRIMARY KEY, topic text NOT NULL, title text, summary text, content text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb, tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text, generated_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fa_assets_code       ON fa.assets (code);
CREATE INDEX IF NOT EXISTS idx_fa_assets_status     ON fa.assets (status);
CREATE INDEX IF NOT EXISTS idx_fa_oa_docno          ON fa.oa_records (doc_no);
CREATE INDEX IF NOT EXISTS idx_fa_oa_status         ON fa.oa_records (status);
CREATE INDEX IF NOT EXISTS idx_fa_knowledge_updated ON fa.knowledge (updated_at DESC);

-- version + updated_at ต่อแถว (optimistic locking) — idempotent, รันซ้ำได้
DO $fa$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','branches','departments','cost_centers','locations',
    'categories','policies','users','running_numbers','assets',
    'oa_records','documents','audit_logs','dep_runs','asset_movements','asset_disposals'
  ] LOOP
    EXECUTE format('ALTER TABLE fa.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0', t);
    EXECUTE format('ALTER TABLE fa.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
  END LOOP;
END
$fa$;
