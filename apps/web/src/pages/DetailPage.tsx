import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import { fetchAccount, fetchSeries, type SeriesPoint } from '../api';
import { Avatar } from '../components/Avatar';
import { Header } from '../components/Header';
import { StatusBadge } from '../components/StatusBadge';
import { formatClock, formatCountComma } from '../format';
import { useECharts } from '../useECharts';

type Metric = 'comments' | 'growth' | 'ratio';
type Range = '24h' | '7d';

const METRIC_META: Record<Metric, { label: string; color: string; pick: (p: SeriesPoint) => number }> = {
  comments: { label: '评论数', color: '#00a1d6', pick: (p) => p.commentCount },
  growth: { label: '评论增速', color: '#f59e0b', pick: (p) => p.growth },
  ratio: { label: '评赞比', color: '#fa4b4b', pick: (p) => p.ratio },
};

function buildMainOption(points: SeriesPoint[], metric: Metric): EChartsOption {
  const meta = METRIC_META[metric];
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  return {
    grid: { left: isMobile ? 44 : 56, right: 12, top: 16, bottom: 32 },
    tooltip: { trigger: 'axis', confine: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((p) => formatClock(p.t)),
      axisLine: { lineStyle: { color: '#e5e8ec' } },
      axisLabel: { color: '#9499a0', fontSize: isMobile ? 10 : 12, interval: isMobile ? 'auto' : 0 },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#eef1f4' } },
      axisLabel: { color: '#9499a0', fontSize: isMobile ? 10 : 12 },
    },
    series: [
      {
        type: 'line',
        data: points.map(meta.pick),
        symbol: 'none',
        lineStyle: { width: isMobile ? 1.8 : 2, color: meta.color },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${meta.color}2e` },
              { offset: 1, color: `${meta.color}00` },
            ],
          },
        },
      },
    ],
  };
}

const tabClass = (active: boolean) =>
  `inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors sm:rounded sm:px-3 sm:py-1 ${active ? 'bg-brand text-white shadow-sm' : 'bg-bg text-muted hover:bg-line hover:text-ink'}`;

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3 sm:rounded-lg sm:p-4">
      <p className="text-[11px] leading-none text-muted sm:text-xs">{label}</p>
      <p className="mt-1.5 truncate text-lg font-semibold leading-none text-ink sm:mt-1 sm:text-2xl">{value}</p>
    </div>
  );
}

export function DetailPage({ mid }: { mid: number }) {
  const [range, setRange] = useState<Range>('24h');
  const [metric, setMetric] = useState<Metric>('comments');
  const resolution = range === '7d' ? '1h' : '5m';

  const account = useQuery({
    queryKey: ['account', mid],
    queryFn: () => fetchAccount(mid),
    refetchInterval: 15_000,
  });
  const series = useQuery({
    queryKey: ['series', mid, range],
    queryFn: () => fetchSeries(mid, range, resolution),
    refetchInterval: 15_000,
  });

  const chartRef = useECharts(buildMainOption(series.data?.points ?? [], metric));
  const view = account.data;

  return (
    <>
      <Header back />
      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Avatar accountId={mid} name={view?.name} size={36} className="sm:!h-10 sm:!w-10" />
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold leading-tight text-ink sm:text-xl">{view?.name ?? '加载中…'}</h1>
          {view && <span className="shrink-0"><StatusBadge status={view.status} /></span>}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-4">
          <StatCard label="盖楼层数" value={view?.latest ? formatCountComma(view.latest.commentCount) : '—'} />
          <StatCard label="每分钟增速" value={view?.perMinute ? `${view.perMinute.comments.toFixed(1)}/分` : '—'} />
          <StatCard label="评赞比" value={view?.latest ? view.latest.ratio.toFixed(1) : '—'} />
        </div>

        <div className="mt-3 rounded-xl border border-line bg-white p-3 sm:mt-4 sm:rounded-lg sm:p-4">
          <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
            <div className="flex shrink-0 gap-1.5 sm:gap-2">
              {(Object.keys(METRIC_META) as Metric[]).map((m) => (
                <button key={m} onClick={() => setMetric(m)} className={tabClass(metric === m)}>
                  {METRIC_META[m].label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex shrink-0 gap-1.5 pl-2 sm:gap-2 sm:pl-0">
              {(['24h', '7d'] as Range[]).map((r) => (
                <button key={r} onClick={() => setRange(r)} className={tabClass(range === r)}>
                  {r === '24h' ? '24小时' : '7天'}
                </button>
              ))}
            </div>
          </div>
          <div ref={chartRef} className="h-64 w-full sm:h-80" />
        </div>
      </main>
    </>
  );
}