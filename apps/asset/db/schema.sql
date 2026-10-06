-- =====================================================================
-- SHD Fixed Asset System — PostgreSQL / Supabase schema (Phase 1)
-- Mirrors requirement §26–27. No hard delete of transactions (§22):
-- use status + archived_at; audit log is append-only (enforced by trigger).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type asset_status as enum ('CANDIDATE','DRAFT','PENDING_REVIEW','ACTIVE','INACTIVE','UNDER_REPAIR','TEMPORARILY_UNUSED','DISPOSED','ARCHIVED');
create type oa_status    as enum ('NEW','REVIEWING','READY_TO_CREATE','CREATED','REJECTED','DUPLICATE','ERROR');
create type run_status   as enum ('DRAFT','CALCULATED','REVIEWED','LOCKED');
create type dep_method   as enum ('SL','DB','UOP');               -- Phase 1 uses SL only
create type proration    as enum ('FULL_MONTH','ACTUAL_DAYS','NEXT_MONTH');
create type start_rule   as enum ('READY_DATE','ACQUISITION_DATE');
create type doc_type     as enum ('OA_APPROVAL','PO','GR','INVOICE','TAX_INVOICE','WARRANTY','CONTRACT','ACCEPTANCE','PHOTO','OTHER');
create type app_role     as enum ('ACCOUNTANT','MANAGER','ADMIN','AUDITOR');
create type account_kind as enum ('ASSET','EXPENSE','ACCUM');

-- ---------------------------------------------------------------- organisation masters
create table companies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_th text not null, name_en text, name_zh text,
  tax_id text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,
  name_th text not null, name_en text, name_zh text,
  address text,
  active boolean not null default true,
  unique (company_id, code)
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_th text not null, name_en text, name_zh text,
  active boolean not null default true
);

create table cost_centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  department_id uuid references departments(id),
  name_th text not null, name_en text, name_zh text,
  active boolean not null default true
);

-- Company → Branch → Building → Floor → Room / Area (§16)
create table asset_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  company_id uuid not null references companies(id),
  branch_id uuid not null references branches(id),
  address text, building text, floor text, room text,
  name_th text not null, name_en text, name_zh text,
  active boolean not null default true
);

-- ---------------------------------------------------------------- accounting masters
create table account_mappings (            -- chart-of-accounts reference (no GL posting in Phase 1)
  code text primary key,                   -- e.g. 124106
  kind account_kind not null,
  name_th text not null, name_en text, name_zh text
);

create table asset_categories (            -- level 1 & 2 in one table (§10: Category └ Subcategory)
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  parent_id uuid references asset_categories(id),
  name_th text not null, name_en text, name_zh text,
  default_unit text not null default 'unit',
  default_useful_life_years int not null default 5 check (default_useful_life_years > 0),
  default_residual_value numeric(18,2) not null default 1,
  default_method dep_method not null default 'SL',
  asset_account text references account_mappings(code),
  depreciation_expense_account text references account_mappings(code),
  accumulated_depreciation_account text references account_mappings(code),
  active boolean not null default true
);
-- convenience view requested in §26
create view asset_subcategories as select * from asset_categories where parent_id is not null;

create table asset_depreciation_policies (
  id uuid primary key default gen_random_uuid(),
  name_th text not null, name_en text, name_zh text,
  category_id uuid not null references asset_categories(id),
  method dep_method not null default 'SL',
  useful_life_years int not null check (useful_life_years > 0),
  residual_value numeric(18,2) not null default 1,
  start_rule start_rule not null default 'READY_DATE',
  proration proration not null default 'FULL_MONTH',
  rounding_decimals int not null default 2,
  effective_date date not null,
  active boolean not null default true,
  approved_by uuid, approved_at timestamptz
);

-- ---------------------------------------------------------------- users & RBAC
create table roles (code app_role primary key, name text not null);
create table permissions (code text primary key, description text);
create table role_permissions (role app_role references roles(code), permission text references permissions(code), primary key (role, permission));
create table users (
  id uuid primary key default gen_random_uuid(),   -- = auth.users.id on Supabase
  name text not null,
  email text not null unique,
  role app_role not null,
  active boolean not null default true
);

create table running_numbers (
  company_id uuid primary key references companies(id),
  prefix text not null,                             -- e.g. 'com' → com26092300001
  include_year boolean not null default true,
  include_month boolean not null default true,
  include_day boolean not null default true,
  seq_digits int not null default 5,
  next_seq bigint not null default 1
);

-- ---------------------------------------------------------------- OA import
create table asset_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('OA_SYNC','EXCEL_LEGACY')),
  file_name text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total_rows int, valid_rows int, error_rows int, duplicate_rows int,
  created_by uuid references users(id)
);

create table asset_import_rows (            -- one row per OA line / Excel line (= Asset Candidate)
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references asset_import_batches(id),
  oa_document_no text,
  status oa_status not null default 'NEW',
  payload jsonb not null,                 -- raw OA / Excel payload
  company_id uuid references companies(id),
  branch_id uuid references branches(id),
  department_id uuid references departments(id),
  cost_center_id uuid references cost_centers(id),
  requester text, approved_date date,
  item_name text, item_description text,
  quantity numeric(18,2), unit text, approved_amount numeric(18,2),
  supplier text, invoice_no text, invoice_date date, po_no text, gr_no text,
  location_id uuid references asset_locations(id),
  approval_ref text,
  suggested_subcategory_id uuid references asset_categories(id),
  duplicate_of uuid references asset_import_rows(id),
  error_code text, reject_reason text,
  reviewed_by uuid references users(id), reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on asset_import_rows (oa_document_no);
create index on asset_import_rows (invoice_no);

-- ---------------------------------------------------------------- assets (§27)
create table assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  name_th text not null,
  name_en text,
  description text,
  category_id uuid references asset_categories(id),
  subcategory_id uuid references asset_categories(id),
  company_id uuid not null references companies(id),
  branch_id uuid references branches(id),
  department_id uuid references departments(id),
  cost_center_id uuid references cost_centers(id),
  location_id uuid references asset_locations(id),
  holder_employee_id uuid,                        -- Phase 2 (OneHR); nullable now
  serial_number text, brand text, model text,
  unit text not null default 'unit',
  quantity numeric(18,2) not null default 1 check (quantity > 0),
  original_cost numeric(18,2) not null check (original_cost >= 0),
  additional_cost numeric(18,2) not null default 0,
  total_cost numeric(18,2) generated always as (original_cost + additional_cost) stored,
  residual_value numeric(18,2) not null default 1,
  useful_life_months int not null check (useful_life_months > 0),
  depreciation_method dep_method not null default 'SL',
  policy_id uuid references asset_depreciation_policies(id),
  acquisition_date date not null,
  ready_for_use_date date,
  accumulated_depreciation numeric(18,2) not null default 0,  -- maintained by locked runs
  net_book_value numeric(18,2) generated always as (original_cost + additional_cost - accumulated_depreciation) stored,
  status asset_status not null default 'DRAFT',
  has_photo boolean not null default false,
  import_row_id uuid references asset_import_rows(id),
  created_at timestamptz not null default now(), created_by uuid references users(id),
  updated_at timestamptz not null default now(), updated_by uuid references users(id),
  archived_at timestamptz,
  constraint ready_after_acq check (ready_for_use_date is null or ready_for_use_date >= acquisition_date),
  constraint residual_lt_cost check (residual_value < original_cost + additional_cost or original_cost = 0)
);
create index on assets (company_id, branch_id, department_id);
create index on assets (subcategory_id);
create index on assets (status);
create index assets_search_idx on assets using gin (to_tsvector('simple', coalesce(asset_code,'') || ' ' || coalesce(name_th,'') || ' ' || coalesce(name_en,'') || ' ' || coalesce(serial_number,'')));

create table asset_source_references (      -- §9.3 purchase / source refs (no payment)
  asset_id uuid primary key references assets(id),
  oa_no text, pr_no text, po_no text, gr_no text, invoice_no text,
  supplier_name text, purchase_date date
);
create index on asset_source_references (oa_no);
create index on asset_source_references (invoice_no);

create table asset_legacy_balances (         -- opening balances from legacy export, kept for reconciliation
  asset_id uuid primary key references assets(id),
  fiscal_year int not null,
  opening_nbv numeric(18,2), opening_accum numeric(18,2), period_dep numeric(18,2),
  closing_nbv numeric(18,2), closing_accum numeric(18,2),
  asset_account text, expense_account text, accum_account text
);

-- ---------------------------------------------------------------- documents & photos
create table asset_documents (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id),
  import_row_id uuid references asset_import_rows(id),
  doc_type doc_type not null,
  file_name text not null,
  storage_path text not null,               -- Supabase Storage key
  size_kb int,
  source_system text not null check (source_system in ('OA','FA','LEGACY')),
  source_document_no text,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now()
);
create table asset_photos (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id),
  storage_path text not null,
  is_main boolean not null default false,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now()
);
create unique index one_main_photo on asset_photos (asset_id) where is_main;

-- ---------------------------------------------------------------- depreciation
create table asset_depreciation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  period char(7) not null,                  -- YYYY-MM
  status run_status not null default 'DRAFT',
  asset_count int, total_depreciation numeric(18,2),
  created_by uuid references users(id), created_at timestamptz not null default now(),
  calculated_at timestamptz,
  reviewed_by uuid references users(id), reviewed_at timestamptz,
  locked_by uuid references users(id), locked_at timestamptz,
  unique (company_id, period)
);

create table asset_depreciation_schedules (
  id bigserial primary key,
  asset_id uuid not null references assets(id),
  run_id uuid references asset_depreciation_runs(id),
  period char(7) not null,
  opening_nbv numeric(18,2) not null,
  depreciation numeric(18,2) not null,
  accumulated_depreciation numeric(18,2) not null,
  closing_nbv numeric(18,2) not null,
  status text not null default 'PLANNED' check (status in ('PLANNED','CALCULATED','LOCKED')),
  unique (asset_id, period)
);

-- Locked periods are immutable
create or replace function forbid_locked_schedule_change() returns trigger language plpgsql as $$
begin
  if old.status = 'LOCKED' then raise exception 'Depreciation period % is locked', old.period; end if;
  return new;
end $$;
create trigger trg_schedule_locked before update or delete on asset_depreciation_schedules
  for each row execute function forbid_locked_schedule_change();

-- ---------------------------------------------------------------- audit log (§21) — append only
create table asset_audit_logs (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid references users(id),
  user_name text not null,
  role text not null,
  action text not null,
  asset_code text,
  entity text not null,
  field text,
  old_value text,
  new_value text,
  reason text,
  source text not null check (source in ('UI','OA_SYNC','EXCEL_IMPORT','SYSTEM'))
);
create index on asset_audit_logs (asset_code);
create index on asset_audit_logs (at desc);

create or replace function forbid_audit_mutation() returns trigger language plpgsql as $$
begin raise exception 'asset_audit_logs is append-only'; end $$;
create trigger trg_audit_no_update before update or delete on asset_audit_logs
  for each row execute function forbid_audit_mutation();

-- Prevent hard delete of assets (§22) — archive instead
create or replace function forbid_asset_delete() returns trigger language plpgsql as $$
begin raise exception 'Assets cannot be deleted; set status = ARCHIVED'; end $$;
create trigger trg_asset_no_delete before delete on assets for each row execute function forbid_asset_delete();

-- ---------------------------------------------------------------- seed: accounts & categories from legacy export
insert into account_mappings (code, kind, name_th) values
 ('124106','ASSET','อุปกรณ์สำนักงาน'),('124107','ASSET','เครื่องตกแต่งสำนักงาน'),('124108','ASSET','ยานพาหนะ'),
 ('124109','ASSET','เครื่องมือเครื่องใช้'),('125101','ASSET','ซอฟต์แวร์'),
 ('530706','EXPENSE','ค่าเสื่อมราคา - อุปกรณ์สำนักงาน'),('530707','EXPENSE','ค่าเสื่อมราคา - เครื่องตกแต่งสำนักงาน'),
 ('530708','EXPENSE','ค่าเสื่อมราคา - ยานพาหนะ'),('530709','EXPENSE','ค่าเสื่อมราคา - เครื่องมือเครื่องใช้'),
 ('530801','EXPENSE','ค่าตัดจำหน่าย - ซอฟต์แวร์'),
 ('124206','ACCUM','ค่าเสื่อมราคาสะสม - อุปกรณ์สำนักงาน'),('124207','ACCUM','ค่าเสื่อมราคาสะสม - เครื่องตกแต่งสำนักงาน'),
 ('124208','ACCUM','ค่าเสื่อมราคาสะสม - ยานพาหนะ'),('124209','ACCUM','ค่าเสื่อมราคาสะสม - เครื่องมือเครื่องใช้'),
 ('125201','ACCUM','ค่าตัดจำหน่ายสะสม - ซอฟต์แวร์');

insert into roles values ('ACCOUNTANT','Asset Accountant'),('MANAGER','Accounting Manager'),('ADMIN','System Admin'),('AUDITOR','Auditor / Viewer');
