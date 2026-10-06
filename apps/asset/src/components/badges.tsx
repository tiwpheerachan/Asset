'use client';

import { useI18n } from '@/lib/i18n';
import type { AssetStatus, OAStatus, RunStatus } from '@/lib/types';
import { Badge, type Tone } from './ui';

const ASSET_TONE: Record<AssetStatus, Tone> = {
  CANDIDATE: 'violet',
  DRAFT: 'gray',
  PENDING_REVIEW: 'amber',
  ACTIVE: 'green',
  INACTIVE: 'gray',
  UNDER_REPAIR: 'amber',
  TEMPORARILY_UNUSED: 'teal',
  DISPOSED: 'red',
  ARCHIVED: 'gray',
};
const OA_TONE: Record<OAStatus, Tone> = {
  NEW: 'blue',
  REVIEWING: 'amber',
  READY_TO_CREATE: 'teal',
  CREATED: 'green',
  REJECTED: 'gray',
  DUPLICATE: 'violet',
  ERROR: 'red',
};
const RUN_TONE: Record<RunStatus, Tone> = { DRAFT: 'gray', CALCULATED: 'blue', REVIEWED: 'amber', LOCKED: 'green' };

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const { t } = useI18n();
  return (
    <Badge tone={ASSET_TONE[status]} dot>
      {t(`status.${status}`)}
    </Badge>
  );
}
export function OAStatusBadge({ status }: { status: OAStatus }) {
  const { t } = useI18n();
  return (
    <Badge tone={OA_TONE[status]} dot>
      {t(`oaStatus.${status}`)}
    </Badge>
  );
}
export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { t } = useI18n();
  return (
    <Badge tone={RUN_TONE[status]} dot>
      {t(`runStatus.${status}`)}
    </Badge>
  );
}
