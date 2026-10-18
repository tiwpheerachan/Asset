import type { Role } from './types';

export type Permission =
  | 'viewAsset'
  | 'createAsset'
  | 'editDraft'
  | 'approveAsset'
  | 'runDep'
  | 'lockDep'
  | 'editCategory'
  | 'editGl'
  | 'importOa'
  | 'uploadDoc'
  | 'exportReport'
  | 'manageUsers'
  | 'viewAudit'
  | 'deleteAudit';

export const ROLES: Role[] = ['ACCOUNTANT', 'MANAGER', 'ADMIN', 'AUDITOR'];

export const MATRIX: Record<Permission, Role[]> = {
  viewAsset: ['ACCOUNTANT', 'MANAGER', 'ADMIN', 'AUDITOR'],
  createAsset: ['ACCOUNTANT', 'MANAGER'],
  editDraft: ['ACCOUNTANT', 'MANAGER'],
  approveAsset: ['MANAGER'],
  runDep: ['ACCOUNTANT', 'MANAGER'],
  lockDep: ['MANAGER'],
  editCategory: ['MANAGER', 'ADMIN'],
  editGl: ['MANAGER'],
  importOa: ['ACCOUNTANT', 'MANAGER'],
  uploadDoc: ['ACCOUNTANT', 'MANAGER'],
  exportReport: ['ACCOUNTANT', 'MANAGER', 'AUDITOR'],
  manageUsers: ['ADMIN'],
  viewAudit: ['ACCOUNTANT', 'MANAGER', 'ADMIN', 'AUDITOR'],
  deleteAudit: [], // never — audit log is append-only
};

export const can = (role: Role, p: Permission) => MATRIX[p].includes(role);

/** เมทริกซ์สิทธิ์ต่อบทบาท (แอดมินปรับได้ในหน้า /admin/users แล้วบันทึกลง DB) */
export type RolePermsMap = Record<Role, Permission[]>;

/** กลุ่ม + ลำดับสิทธิ์ สำหรับตารางติ๊ก (ป้ายกำกับอยู่ใน i18n: perm.<key> / perm.<key>_desc) */
export const PERMISSION_GROUPS: { group: string; perms: Permission[] }[] = [
  { group: 'asset', perms: ['viewAsset', 'createAsset', 'editDraft', 'approveAsset', 'importOa', 'uploadDoc'] },
  { group: 'acc', perms: ['runDep', 'lockDep', 'editCategory', 'editGl', 'exportReport'] },
  { group: 'gov', perms: ['manageUsers', 'viewAudit', 'deleteAudit'] },
];

export const PERMISSION_ORDER: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.perms);

/** สิทธิ์ที่ล็อกไว้ทุกบทบาท — ปรับไม่ได้ */
export const LOCKED_OFF: Permission[] = ['deleteAudit']; // append-only ไม่มีใครลบได้

/** เมทริกซ์เริ่มต้น (แปลงจาก MATRIX) ใช้เป็นค่าตั้งต้น/ค่า reset */
export function defaultRolePerms(): RolePermsMap {
  const out: RolePermsMap = { ACCOUNTANT: [], MANAGER: [], ADMIN: [], AUDITOR: [] };
  for (const p of PERMISSION_ORDER) for (const r of MATRIX[p]) out[r].push(p);
  return out;
}

/**
 * สิทธิ์นี้ถูกล็อกอยู่ไหม (แก้ไม่ได้) — 'on' = บังคับเปิด, 'off' = บังคับปิด, null = ปรับได้
 * - deleteAudit: ปิดตายทุกบทบาท (append-only)
 * - manageUsers: เปิดเฉพาะ ADMIN เสมอ (กันแอดมินล็อกตัวเองออก และกันบทบาทอื่นแตะหน้าจัดการผู้ใช้)
 */
export function lockState(role: Role, p: Permission): 'on' | 'off' | null {
  if (LOCKED_OFF.includes(p)) return 'off';
  if (p === 'manageUsers') return role === 'ADMIN' ? 'on' : 'off';
  return null;
}

/** can ที่อิงเมทริกซ์ที่แอดมินตั้งไว้ (ถ้ามี) — บังคับ lock เสมอ ถ้าไม่มีใช้ค่าเริ่มต้น */
export function canWith(perms: RolePermsMap | null | undefined, role: Role, p: Permission): boolean {
  const lock = lockState(role, p);
  if (lock) return lock === 'on';
  const list = perms?.[role];
  return list ? list.includes(p) : can(role, p);
}
