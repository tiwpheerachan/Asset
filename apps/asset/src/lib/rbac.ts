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
