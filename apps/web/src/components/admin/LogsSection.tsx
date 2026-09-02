import { formatClock, formatCount, formatCountWan, formatDate } from '../../format';
import { badgeBase, badgeTone, tableBase, tableScroll } from '../ui';
import type { RequestLog } from '../../api';

export function StatusCodeBadge({ code }: { code: string }) {
  const cls =
    code === 'ok'
      ? badgeTone.brand
      : code === '-101'
        ? badgeTone.watch
        : code === '412' || code === '429' || code === '-352'
          ? badgeTone.danger
          : badgeTone.muted;
  return (
    <span className={`${badgeBase} ${cls}`}>
      {code === 'ok' ? 'ok' : code}
    </span>
  );
}

function StackBar({ logs }: { logs: RequestLog[] }) {
  const total = logs.length;
  if (total === 0) return null;
  const ok = logs.filter((l) => l.statusCode === 'ok').length;
  const fail = total - ok;
  const okPct = Math.round((ok / total) * 100);
  const failPct = 100 - okPct;
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />
            <span className="text-muted">成功</span>
            <span className="font-medium text-ink">{ok}</span>
            <span className="text-muted">{okPct}%</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-danger" aria-hidden />
            <span className="text-muted">失败</span>
            <span className="font-medium text-ink">{fail}</span>
            <span className="text-muted">{failPct}%</span>
          </span>
        </div>
        <span className="text-sm text-muted">共 {total} 条</span>
      </div>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-line">
        {ok > 0 && <div style={{ width: `${okPct}%` }} className="bg-brand transition-all" />}
        {fail > 0 && <div style={{ width: `${failPct}%` }} className="bg-danger transition-all" />}
      </div>
    </div>
  );
}

export function RequestLogsTable({ logs }: { logs: RequestLog[] }) {
  return (
    <div>
      <StackBar logs={logs} />
      <div className={`${tableScroll} -mx-3 px-3 sm:mx-0 sm:px-0`}>
        <table className={`${tableBase} min-w-[720px]`}>
          <thead>
            <tr className="border-b border-line text-left text-sm text-muted">
              <th className="py-3 pr-3 font-medium">日期</th>
              <th className="py-3 pr-3 font-medium">时间</th>
              <th className="py-3 pr-3 font-medium">B站ID</th>
              <th className="py-3 pr-3 font-medium">显示名称</th>
              <th className="py-3 pr-3 font-medium">端点</th>
              <th className="py-3 pr-3 font-medium">状态</th>
              <th className="py-3 pr-3 font-medium">评论</th>
              <th className="py-3 font-medium">点赞</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-line/60 last:border-0 hover:bg-bg/40">
                <td className="py-3 pr-3 font-mono text-sm text-muted">{formatDate(log.updatedAt)}</td>
                <td className="py-3 pr-3 text-sm text-muted">{formatClock(log.updatedAt)}</td>
                <td className="py-3 pr-3 font-mono text-sm text-ink">{log.accountMid != null ? String(log.accountMid) : <span className="text-muted">—</span>}</td>
                <td className="py-3 pr-3 text-sm text-ink">{log.accountName ?? <span className="text-muted">—</span>}</td>
                <td className="py-3 pr-3 text-sm text-muted">{log.endpoint}</td>
                <td className="py-3 pr-3">
                  <StatusCodeBadge code={log.statusCode} />
                </td>
                <td className="py-3 pr-3 text-sm text-ink">{log.statusCode === 'ok' ? formatCountWan(log.commentCount) : '—'}</td>
                <td className="py-3 text-sm text-ink">{log.statusCode === 'ok' ? formatCount(log.likeCount) : '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-sm text-muted">
                  暂无请求记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
