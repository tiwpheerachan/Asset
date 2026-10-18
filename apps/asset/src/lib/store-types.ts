import type {
  AppUser, Asset, AssetDocument, AssetDisposal, AssetMaintenance, AssetMovement, AuditLog, Branch, Category, Company,
  CostCenter, Department, DepPolicy, DepRun, Location, OAIntegration,
  OARecord, Role, RunningNumberConfig, VerifyCampaign, VerifyRecord,
} from './types';
import type { RolePermsMap } from './rbac';

/** รูปข้อมูลทั้งระบบ (ใช้ร่วมกันทั้ง client store และ server repo) */
export interface State {
  version: number;
  session: { userId: string; role: Role; name: string; avatarUrl?: string | null; title?: string | null; department?: string | null } | null;
  assets: Asset[];
  oa: OARecord[];
  documents: AssetDocument[];
  audit: AuditLog[];
  runs: DepRun[];
  movements: AssetMovement[];
  disposals: AssetDisposal[];
  maintenance: AssetMaintenance[];
  verifyCampaigns: VerifyCampaign[];
  verifyRecords: VerifyRecord[];
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
  /** เมทริกซ์สิทธิ์ต่อบทบาทที่แอดมินปรับได้ (ติ๊กในหน้า /admin/users) */
  rolePerms: RolePermsMap;
}
