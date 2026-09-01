import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { fetchAccount, fetchSeries, fetchTargets, type SeriesGroup, type TargetView } from '../api';
import { Avatar } from '../components/Avatar';
import { Header } from '../components/Header';
import { RefreshControl, useRefresh } from '../components/RefreshControl';
import { StatusBadge } from '../components/StatusBadge';
import { badgeBase, badgeTone, pageShell, tabClass } from '../components/ui';
import { formatClock, formatCountWan, formatDateTime } from '../format';
import { useECharts } from '../useECharts';

type Range = '24h' | '7d';

const PALETTE = ['#00a1d6', '#f59e0b', '#fa4b4b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'];

function colorForTarget(targetId: string): string {
  let h = 0;
  for (let i = 0; i < targetId.length; i++) h = (h * 31 + targetId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

function buildMultiOption(groups: SeriesGroup[], range: Range): EChartsOption {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  if (groups.length === 0) {
    return {
      grid: { left: isMobile ? 44 : 56, right: 12, top: 16, bottom: 32 },
      xAxis: { type: 'category', data: [] },
      yAxis: { type: 'value' },
      series: [],
    };
  }
  const timeSet = new Set<string>();
  for (const g of groups) for (const p of g.points) timeSet.add(p.t);
  const times = Array.from(timeSet).sort();
  const timeIndex = new Map(times.map((t, i) => [t, i] as const));

  const series = groups.map((g) => {
    const color = colorForTarget(g.targetId);
    const data: (number | null)[] = Array(times.length).fill(null);
    const pointMap = new Map(g.points.map((p) => [p.t, p] as const));
    for (const t of times) {
      const p = pointMap.get(t);
      if (p) data[timeIndex.get(t)!] = p.growth;
    }
    return {
      type: 'line' as const,
      name: shortId(g.targetId),
      data,
      symbol: 'none',
      connectNulls: true,
      itemStyle: { color },
      lineStyle: { width: isMobile ? 1.6 : 2, color },
      emphasis: { focus: 'series' as const },
    };
  });

  return {
    grid: { left: isMobile ? 44 : 56, right: 12, top: 36, bottom: 28 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      renderMode: 'html',
      formatter: (params: unknown) => {
        const items = (Array.isArray(params) ? params : [params]) as CallbackDataParams[];
        const first = items[0];
        const idx = (first?.dataIndex ?? 0) as number;
        const time = times[idx] ? formatDateTime(times[idx]!) : first?.name ?? '';
        const lines = items.map((item) => {
          const marker = typeof item.marker === 'string' ? item.marker : '';
          const v = Number(item.value);
          const text = Number.isFinite(v) ? `${v.toFixed(1)}/分` : '—';
          return `${marker}${item.seriesName}: ${text}`;
        });
        return [time, ...lines].join('<br/>');
      },
    },
    legend: {
      type: 'scroll',
      top: 0,
      left: 'center',
      right: 12,
      itemGap: 14,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      pageIconColor: '#c2c6cc',
      pageIconInactiveColor: '#e5e8ec',
      pageTextStyle: { color: '#9499a0', fontSize: 10 },
      data: groups.map((g) => shortId(g.targetId)),
      textStyle: { fontSize: 10, color: '#606770' },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: times,
      axisLine: { lineStyle: { color: '#e5e8ec' } },
      axisLabel: {
        color: '#9499a0',
        fontSize: isMobile ? 10 : 12,
        interval: 'auto',
        hideOverlap: true,
        formatter: (_value: string, index: number) => {
          const t = times[index];
          if (!t) return '';
          return range === '7d' ? formatDateTime(t).slice(5, 10) : formatClock(t);
        },
      },
    },
    yAxis: {
      type: 'value',
      name: '条/分',
      nameTextStyle: { color: '#9499a0', fontSize: 10 },
      splitLine: { lineStyle: { color: '#eef1f4' } },
      axisLabel: {
        color: '#9499a0',
        fontSize: isMobile ? 10 : 12,
      },
    },
    series,
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

function TargetTable({ targets }: { targets: TargetView[] }) {
  if (targets.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">暂无活跃动态</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th className="px-2 py-2 font-medium">动态</th>
            <th className="px-2 py-2 font-medium text-right">评论数</th>
            <th className="px-2 py-2 font-medium text-right">评论增速</th>
            <th className="px-2 py-2 font-medium text-right">点赞数</th>
            <th className="px-2 py-2 font-medium text-right">评赞比</th>
            <th className="px-2 py-2 font-medium text-right">状态</th>
            <th className="px-2 py-2 font-medium text-right">跳转</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => (
            <tr key={t.targetId} className="border-b border-line/50 last:border-0">
              <td className="px-2 py-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorForTarget(t.targetId) }} />
                  <span className="font-mono text-xs text-ink">{shortId(t.targetId)}</span>
                </span>
              </td>
              <td className="px-2 py-2 text-right font-medium text-ink">{formatCountWan(t.commentCount)}</td>
              <td className="px-2 py-2 text-right text-ink">{t.perMinute ? `${t.perMinute.comments.toFixed(1)}/分` : '—'}</td>
              <td className="px-2 py-2 text-right text-ink">{formatCountWan(t.likeCount)}</td>
              <td className="px-2 py-2 text-right text-ink">{t.ratio.toFixed(2)}</td>
              <td className="px-2 py-2 text-right">
                <StatusBadge status={t.status} />
              </td>
              <td className="px-2 py-2 text-right">
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand hover:underline"
                >
                  查看
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DetailPage({ mid }: { mid: number }) {
  const { intervalMs } = useRefresh();
  const [range, setRange] = useState<Range>('24h');
  const resolution = range === '7d' ? '1h' : '5m';

  const account = useQuery({
    queryKey: ['account', mid],
    queryFn: () => fetchAccount(mid),
    refetchInterval: intervalMs,
  });

  const targets = useQuery({
    queryKey: ['targets', mid],
    queryFn: () => fetchTargets(mid),
    refetchInterval: intervalMs,
  });

  const seriesInterval = Math.max(intervalMs, 60_000);
  const series = useQuery({
    queryKey: ['series', mid, range],
    queryFn: () => fetchSeries(mid, range, resolution),
    refetchInterval: seriesInterval,
    staleTime: 30_000,
  });

  const groups = series.data?.series ?? [];
  const chartOption = useMemo(() => buildMultiOption(groups, range), [groups, range]);
  const chartRef = useECharts(chartOption);
  const view = account.data;

  const maxComment = view?.maxComment ?? view?.latest?.commentCount ?? null;
  const totalGrowth = view?.totalGrowth ?? view?.perMinute;
  const maxRatio = view?.maxRatio ?? view?.latest?.ratio ?? null;

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
          {view?.activeCount !== undefined && view.activeCount > 0 && (
            <span className={`shrink-0 ${badgeBase} ${badgeTone.brand}`}>{view.activeCount} 活跃</span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="最高楼层" value={maxComment !== null ? formatCountWan(maxComment) : '—'} />
          <StatCard label="总盖楼速度" value={totalGrowth ? `${totalGrowth.comments.toFixed(1)}/分` : '—'} />
          <StatCard label="最大评赞比" value={maxRatio !== null ? maxRatio.toFixed(2) : '—'} />
        </div>

        <div className="mt-4 rounded-lg border border-line bg-white p-3 shadow-sm sm:p-4">
          <div className="flex items-center justify-between gap-3 pb-3">
            <h2 className="text-sm font-semibold text-ink">评论增速变化</h2>
            <div className="flex shrink-0 gap-1.5 sm:gap-2">
              {(['24h', '7d'] as Range[]).map((r) => (
                <button type="button" key={r} onClick={() => setRange(r)} aria-pressed={range === r} className={tabClass(range === r)}>
                  {r === '24h' ? '24小时' : '7天'}
                </button>
              ))}
            </div>
          </div>
          {groups.length === 0 ? (
            <p className="flex h-64 items-center justify-center text-sm text-muted sm:h-80">{targets.isLoading ? '加载中…' : '暂无活跃动态'}</p>
          ) : (
            <div ref={chartRef} className="h-64 w-full sm:h-80" />
          )}
        </div>

        <div className="mt-4 rounded-lg border border-line bg-white p-3 shadow-sm sm:p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">节奏动态一览</h2>
          {targets.isLoading ? (
            <p className="py-8 text-center text-sm text-muted">加载中…</p>
          ) : targets.isError ? (
            <p className="py-8 text-center text-sm text-muted">加载失败</p>
          ) : (
            <TargetTable targets={targets.data ?? []} />
          )}
        </div>
      </main>
    </>
  );
}
