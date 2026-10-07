import type {
  AppUser, Asset, AssetDocument, AssetMovement, AuditLog, Branch, Category, Company,
  CostCenter, Department, DepPolicy, DepRun, Location, OAIntegration,
  OARecord, Role, RunningNumberConfig,
} from './types';

/** รูปข้อมูลทั้งระบบ (ใช้ร่วมกันทั้ง client store และ server repo) */
export interface State {
  version: number;
  session: { userId: string; role: Role; name: string } | null;
  assets: Asset[];
  oa: OARecord[];
  documents: AssetDocument[];
  audit: AuditLog[];
  runs: DepRun[];
  movements: AssetMovement[];
  policies: DepPolicy[];
  categories: Category[];
  companies: Company[];
  branches: Branch[];
  departments: Department[];
  costCenters: CostCenter[];
  locations: Location[];
  running: RunningNumberConfig[];
  oaIntegration: OAIntegration;
  users: AppUser[];
}
