import type { PaceStatus } from '@pace-radar/shared';

const STATUS_TEXT: Record<PaceStatus, string> = {
  normal: '正常',
  watching: '观察',
  active: '节奏中',
};

const STATUS_CLASS: Record<PaceStatus, string> = {
  normal: 'status-normal',
  watching: 'status-watching',
  active: 'status-active',
};

export function StatusBadge({ status }: { status: PaceStatus }) {
  return (
    <span className={`status-badge ${STATUS_CLASS[status]}`}>
      {STATUS_TEXT[status]}
    </span>
  );
}
