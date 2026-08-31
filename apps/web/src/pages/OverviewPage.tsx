import { useQuery } from '@tanstack/react-query';
import { fetchAccounts } from '../api';
import { AccountCard } from '../components/AccountCard';
import { Header } from '../components/Header';

export function OverviewPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
    refetchInterval: 30_000,
  });

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        {isLoading && <p className="py-16 text-center text-sm text-muted">加载中…</p>}
        {isError && <p className="py-16 text-center text-sm text-muted">数据加载失败，请稍后刷新重试</p>}
        {data?.length === 0 && <p className="py-16 text-center text-sm text-muted">尚未配置监测账号</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {data?.map((account) => (
            <AccountCard key={account.mid} account={account} />
          ))}
        </div>
      </main>
    </>
  );
}