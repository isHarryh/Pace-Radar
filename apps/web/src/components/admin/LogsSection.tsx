import { formatClock, formatCount } from '../../format';

export function StatusCodeBadge({ code }: { code: string }) {
  const cls =
    code === 'ok'
      ? 'bg-brand/10 text-brand'
      : code === '-101'
        ? 'bg-watch/10 text-watch'
        : code === '412' || code === '429' || code === '-352'
          ? 'bg-danger/10 text-danger'
          : 'bg-line text-muted';
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {code === 'ok' ? 'ok' : code}
    </span>
  );
}

export function RequestLogsTable({ logs }: { logs: { id: number; accountId: number; accountName: string | null; commentCount: number; likeCount: number; statusCode: string; endpoint: string; updatedAt: string }[] }) {
  return (
    <div className="-mx-3 overflow-x-auto overscroll-x-contain px-3 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-2 pr-3 font-normal">时间</th>
            <th className="py-2 pr-3 font-normal">账号</th>
            <th className="py-2 pr-3 font-normal">端点</th>
            <th className="py-2 pr-3 font-normal">状态</th>
            <th className="py-2 pr-3 font-normal">评论</th>
            <th className="py-2 font-normal">点赞</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-line/60">
              <td className="py-2.5 pr-3 text-muted sm:py-2">{formatClock(log.updatedAt)}</td>
              <td className="py-2.5 pr-3 text-ink sm:py-2">{log.accountName ?? `#${log.accountId}`}</td>
              <td className="py-2.5 pr-3 text-muted sm:py-2">{log.endpoint}</td>
              <td className="py-2.5 pr-3 sm:py-2">
                <StatusCodeBadge code={log.statusCode} />
              </td>
              <td className="py-2.5 pr-3 text-ink sm:py-2">{log.statusCode === 'ok' ? formatCount(log.commentCount) : '—'}</td>
              <td className="py-2.5 text-ink sm:py-2">{log.statusCode === 'ok' ? formatCount(log.likeCount) : '—'}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-sm text-muted">
                暂无请求记录
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}