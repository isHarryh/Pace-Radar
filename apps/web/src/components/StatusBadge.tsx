import type { PaceStatus } from '@pace-radar/shared';
import { badgeBase, badgeTone } from './ui';

const STATUS_TEXT: Record<PaceStatus, string> = {
  normal: '正常',
  pacing: '节奏中',
};

const STATUS_CLASS: Record<PaceStatus, string> = {
  normal: badgeTone.brand,
  pacing: badgeTone.danger,
};

export function StatusBadge({ status }: { status: PaceStatus }) {
  return <span className={`${badgeBase} ${STATUS_CLASS[status]}`}>{STATUS_TEXT[status]}</span>;
}
