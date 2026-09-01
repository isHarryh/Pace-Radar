import { createContext, useContext, useState, type ReactNode } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';

const REFRESH_OPTIONS = [
  { value: 15_000, label: '15s' },
  { value: 60_000, label: '1m' },
  { value: 300_000, label: '5m' },
] as const;

type RefreshInterval = (typeof REFRESH_OPTIONS)[number]['value'];

interface RefreshContextValue {
  intervalMs: RefreshInterval;
  setIntervalMs: (value: RefreshInterval) => void;
  refresh: () => Promise<void>;
  isRefreshing: boolean;
}

const RefreshContext = createContext<RefreshContextValue | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [intervalMs, setIntervalMs] = useState<RefreshInterval>(60_000);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setIsRefreshing(false);
    }
  };

  return <RefreshContext.Provider value={{ intervalMs, setIntervalMs, refresh, isRefreshing }}>{children}</RefreshContext.Provider>;
}

export function useRefresh() {
  const value = useContext(RefreshContext);
  if (!value) throw new Error('useRefresh must be used within RefreshProvider');
  return value;
}

export function RefreshControl() {
  const { intervalMs, setIntervalMs, refresh, isRefreshing } = useRefresh();
  const isFetching = useIsFetching() > 0;
  const busy = isRefreshing || isFetching;
  const currentIndex = REFRESH_OPTIONS.findIndex((option) => option.value === intervalMs);
  const currentOption = REFRESH_OPTIONS[currentIndex]!;

  const adjustInterval = (offset: -1 | 1) => {
    const nextOption = REFRESH_OPTIONS[currentIndex + offset];
    if (nextOption) setIntervalMs(nextOption.value);
  };

  return (
    <div className="flex items-center">
      <div className="flex h-9 items-center rounded-l-lg border border-r-0 border-line bg-white">
        <button
          type="button"
          aria-label="缩短刷新间隔"
          title="缩短刷新间隔"
          onClick={() => adjustInterval(-1)}
          disabled={busy || currentIndex <= 0}
          className="inline-flex h-full w-7 items-center justify-center text-sm text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
        >
          &lt;
        </button>
        <span aria-label="当前刷新间隔" className="w-9 text-center text-xs font-medium text-ink" aria-live="polite">
          {currentOption.label}
        </span>
        <button
          type="button"
          aria-label="延长刷新间隔"
          title="延长刷新间隔"
          onClick={() => adjustInterval(1)}
          disabled={busy || currentIndex >= REFRESH_OPTIONS.length - 1}
          className="inline-flex h-full w-7 items-center justify-center text-sm text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
        >
          &gt;
        </button>
      </div>
      <button
        type="button"
        aria-label="立即刷新"
        aria-busy={busy}
        onClick={() => void refresh()}
        disabled={busy}
        className="button-secondary h-9 gap-1.5 rounded-l-none border border-line px-3 text-xs disabled:bg-line disabled:text-muted sm:text-sm"
      >
        <span aria-hidden="true">↻</span>
        刷新
      </button>
    </div>
  );
}
