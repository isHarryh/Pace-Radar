import type { PaceStatus } from '@pace-radar/shared';

const STATUS_TEXT: Record<PaceStatus, string> = {
  normal: '正常',
  watching: '观察',
  active: '节奏中',
};

const STATUS_CLASS: Record<PaceStatus, string> = {
  normal: 'bg-brand/10 text-brand',
  watching: 'bg-watch/10 text-watch',
  active: 'bg-danger/10 text-danger',
};

export function StatusBadge({ status }: { status: PaceStatus }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_TEXT[status]}
    </span>
  );
}