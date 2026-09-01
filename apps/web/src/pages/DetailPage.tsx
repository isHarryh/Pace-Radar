import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { fetchAccount, fetchSeries, type SeriesPoint } from '../api';
import { Avatar } from '../components/Avatar';
import { Header } from '../components/Header';
import { RefreshControl, useRefresh } from '../components/RefreshControl';
import { StatusBadge } from '../components/StatusBadge';
import { pageShell, tabClass } from '../components/ui';
import { formatClock, formatCountWan, formatDateTime } from '../format';
import { useECharts } from '../useECharts';

type Metric = 'comments' | 'growth' | 'ratio';
type Range = '24h' | '7d';
type TooltipParams = CallbackDataParams | CallbackDataParams[];

const METRIC_META: Record<Metric, { label: string; color: string; pick: (p: SeriesPoint) => number }> = {
  comments: { label: '评论数', color: '#00a1d6', pick: (p) => p.commentCount },
  growth: { label: '评论增速', color: '#f59e0b', pick: (p) => p.growth },
  ratio: { label: '评赞比', color: '#fa4b4b', pick: (p) => p.ratio },
};

function formatMetricValue(value: unknown, metric: Metric): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return metric === 'comments' ? formatCountWan(number) : number.toFixed(3);
}

function formatTooltip(params: TooltipParams, points: SeriesPoint[], metric: Metric): string {
  const items = Array.isArray(params) ? params : [params];
  const first = items[0];
  const point = first ? points[first.dataIndex] : undefined;
  const time = point ? formatDateTime(point.t) : first?.name ?? '';
  return [
    time,
    ...items.map((item) => {
      const marker = typeof item.marker === 'string' ? item.marker : '';
      return `${marker}${item.seriesName ?? METRIC_META[metric].label}: ${formatMetricValue(item.value, metric)}`;
    }),
  ].join('<br/>');
}

function buildMainOption(points: SeriesPoint[], metric: Metric, range: Range): EChartsOption {
  const meta = METRIC_META[metric];
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  return {
    grid: { left: isMobile ? 44 : 56, right: 12, top: 16, bottom: 32 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      renderMode: 'html',
      formatter: (params) => formatTooltip(params, points, metric),
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((p) => p.t),
      axisLine: { lineStyle: { color: '#e5e8ec' } },
      axisLabel: {
        color: '#9499a0',
        fontSize: isMobile ? 10 : 12,
        interval: 'auto',
        hideOverlap: true,
        formatter: (_value, index) => {
          const point = points[index];
          if (!point) return '';
          return range === '7d' ? formatDateTime(point.t).slice(5, 10) : formatClock(point.t);
        },
      },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#eef1f4' } },
      axisLabel: {
        color: '#9499a0',
        fontSize: isMobile ? 10 : 12,
        formatter: metric === 'comments' ? (value) => formatCountWan(Number(value)) : undefined,
      },
    },
    series: [
      {
        type: 'line',
        name: meta.label,
        data: points.map(meta.pick),
        symbol: 'none',
        itemStyle: { color: meta.color },
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-white p-3 shadow-sm sm:p-4">
      <p className="text-[11px] leading-none text-muted sm:text-xs">{label}</p>
      <p className="mt-1.5 truncate text-lg font-semibold leading-none text-ink sm:mt-1 sm:text-2xl">{value}</p>
    </div>
  );
}

export function DetailPage({ mid }: { mid: number }) {
  const { intervalMs } = useRefresh();
  const [range, setRange] = useState<Range>('24h');
  const [metric, setMetric] = useState<Metric>('comments');
  const resolution = range === '7d' ? '1h' : '5m';

  const account = useQuery({
    queryKey: ['account', mid],
    queryFn: () => fetchAccount(mid),
    refetchInterval: intervalMs,
  });
  const series = useQuery({
    queryKey: ['series', mid, range],
    queryFn: () => fetchSeries(mid, range, resolution),
    refetchInterval: intervalMs,
  });

  const chartRef = useECharts(buildMainOption(series.data?.points ?? [], metric, range));
  const view = account.data;

  return (
    <>
      <Header back>
        <RefreshControl />
      </Header>
      <main className={pageShell}>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Avatar accountId={mid} name={view?.name} size={36} className="sm:!h-10 sm:!w-10" />
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold leading-tight text-ink sm:text-xl">{view?.name ?? '加载中…'}</h1>
          {view && <span className="shrink-0"><StatusBadge status={view.status} /></span>}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="盖楼层数" value={view?.latest ? formatCountWan(view.latest.commentCount) : '—'} />
          <StatCard label="每分钟增速" value={view?.perMinute ? `${view.perMinute.comments.toFixed(1)}/分` : '—'} />
          <StatCard label="评赞比" value={view?.latest ? view.latest.ratio.toFixed(1) : '—'} />
        </div>

        <div className="mt-4 rounded-lg border border-line bg-white p-3 shadow-sm sm:p-4">
          <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
            <div className="flex shrink-0 gap-1.5 sm:gap-2">
              {(Object.keys(METRIC_META) as Metric[]).map((m) => (
                <button type="button" key={m} onClick={() => setMetric(m)} aria-pressed={metric === m} className={tabClass(metric === m)}>
                  {METRIC_META[m].label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex shrink-0 gap-1.5 pl-2 sm:gap-2 sm:pl-0">
              {(['24h', '7d'] as Range[]).map((r) => (
                <button type="button" key={r} onClick={() => setRange(r)} aria-pressed={range === r} className={tabClass(range === r)}>
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
