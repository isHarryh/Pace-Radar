import type { EChartsOption } from 'echarts';
import type { AccountView } from '../api';
import { formatCount } from '../format';
import { useECharts } from '../useECharts';
import { Avatar } from './Avatar';
import { StatusBadge } from './StatusBadge';

function buildSparkOption(points: { t: string; growth: number }[]): EChartsOption {
  return {
    grid: { left: 0, right: 0, top: 2, bottom: 0 },
    xAxis: { type: 'category', show: false, data: points.map((p) => p.t) },
    yAxis: { type: 'value', show: false },
    series: [
      {
        type: 'line',
        data: points.map((p) => Number(p.growth.toFixed(1))),
        symbol: 'none',
        lineStyle: { width: 1.5, color: '#f59e0b' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 158, 11, 0.18)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0)' },
            ],
          },
        },
      },
    ],
  };
}

function Sparkline({ points }: { points: { t: string; growth: number }[] }) {
  const ref = useECharts(buildSparkOption(points));
  return <div ref={ref} className="h-10 w-full" />;
}

export function AccountCard({ account }: { account: AccountView }) {
  const { latest, perMinute } = account;
  return (
    <a
      href={`#/accounts/${account.mid}`}
      className="group flex cursor-pointer flex-col gap-3 rounded-lg border border-line bg-white p-4 text-inherit no-underline shadow-sm transition hover:-translate-y-px hover:border-brand hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 active:bg-bg"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar accountId={account.mid} name={account.name} size={32} />
          <h3 className="truncate text-sm font-medium text-ink sm:text-[15px]">{account.name}</h3>
        </div>
        <StatusBadge status={account.status} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="min-w-0">
          <p className="truncate text-xl font-semibold text-ink sm:text-2xl">{latest ? formatCount(latest.commentCount) : '—'}</p>
          <p className="mt-0.5 text-[11px] leading-none text-muted sm:text-xs">评论楼层</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-ink sm:text-lg">{perMinute ? `${perMinute.comments.toFixed(1)}/分` : '—'}</p>
          <p className="mt-0.5 text-[11px] leading-none text-muted sm:text-xs">盖楼速度</p>
        </div>
        <div className="min-w-0 text-right sm:text-left">
          <p className="truncate text-base font-medium text-ink sm:text-lg">{latest ? latest.ratio.toFixed(1) : '—'}</p>
          <p className="mt-0.5 text-[11px] leading-none text-muted sm:text-xs">评赞比</p>
        </div>
      </div>
      {account.spark && account.spark.length > 1 ? (
        <Sparkline points={account.spark} />
      ) : (
        <p className="py-2 text-center text-xs text-muted">暂无数据</p>
      )}
    </a>
  );
}
