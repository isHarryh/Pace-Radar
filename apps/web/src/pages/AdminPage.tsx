import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminLogs } from '../api';
import { Header } from '../components/Header';
import { AccountsSection } from '../components/admin/AccountsSection';
import { ConfigSection } from '../components/admin/ConfigSection';
import { CookieSection } from '../components/admin/CookieSection';
import { RequestLogsTable } from '../components/admin/LogsSection';
import { RefreshControl, useRefresh } from '../components/RefreshControl';
import { pageShell, surface, surfaceContent, tabClass } from '../components/ui';

function useAdminTab(): 'manage' | 'logs' {
  const getTab = () => (window.location.hash.startsWith('#/admin/logs') ? 'logs' : 'manage');
  const [tab, setTab] = useState<'manage' | 'logs'>(getTab);
  useEffect(() => {
    const onChange = () => setTab(getTab());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return tab;
}

export function AdminPage() {
  const { intervalMs } = useRefresh();
  const tab = useAdminTab();
  const { data: logs } = useQuery({
    queryKey: ['admin-logs'],
    queryFn: () => fetchAdminLogs(50),
    enabled: tab === 'logs',
    refetchInterval: intervalMs,
  });

  return (
    <>
      <Header back>
        <RefreshControl />
      </Header>
      <main className={pageShell}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-ink">管理后台</h1>
          <nav className="flex gap-2 self-start sm:self-auto" aria-label="管理后台导航">
            <a href="#/admin" aria-current={tab === 'manage' ? 'page' : undefined} className={tabClass(tab === 'manage')}>
              账号与配置
            </a>
            <a href="#/admin/logs" aria-current={tab === 'logs' ? 'page' : undefined} className={tabClass(tab === 'logs')}>
              请求日志
            </a>
          </nav>
        </div>

        {tab === 'manage' ? (
          <div className="mt-6 flex flex-col gap-5">
            <ConfigSection />
            <CookieSection />
            <AccountsSection />
          </div>
        ) : (
          <div className={`${surface} ${surfaceContent} mt-6`}>
            <h2 className="mb-4 text-[15px] font-semibold text-ink">最近请求</h2>
            <RequestLogsTable logs={logs ?? []} />
          </div>
        )}
      </main>
    </>
  );
}
