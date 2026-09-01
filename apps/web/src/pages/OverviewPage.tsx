import { useQuery } from '@tanstack/react-query';
import { fetchAccounts } from '../api';
import { AccountCard } from '../components/AccountCard';
import { Header } from '../components/Header';
import { RefreshControl, useRefresh } from '../components/RefreshControl';
import { pageShell } from '../components/ui';

export function OverviewPage() {
  const { intervalMs } = useRefresh();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
    refetchInterval: intervalMs,
  });

  return (
    <>
      <Header>
        <RefreshControl />
      </Header>
      <main className={pageShell}>
        {data ? (
          data.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.map((account) => (
                <AccountCard key={account.mid} account={account} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-muted">尚未配置监测账号</p>
          )
        ) : isLoading ? (
          <p className="py-16 text-center text-sm text-muted">加载中…</p>
        ) : isError ? (
          <p className="py-16 text-center text-sm text-muted">数据加载失败，请稍后刷新重试</p>
        ) : null}
      </main>
    </>
  );
}
