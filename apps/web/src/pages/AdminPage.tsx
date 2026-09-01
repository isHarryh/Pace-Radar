import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminLogs } from '../api';
import { Header } from '../components/Header';
import { AccountsSection } from '../components/admin/AccountsSection';
import { ConfigSection } from '../components/admin/ConfigSection';
import { CookieSection } from '../components/admin/CookieSection';
import { RequestLogsTable } from '../components/admin/LogsSection';
import { RefreshControl, useRefresh } from '../components/RefreshControl';
import { pageShell, surface, surfaceContent, tabClass } from '../components/ui';

export function AdminPage() {
  const { intervalMs } = useRefresh();
  const [tab, setTab] = useState<'manage' | 'logs'>('manage');
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold text-ink sm:text-xl">管理后台</h1>
          <div className="flex gap-2 self-start sm:self-auto">
            <button type="button" onClick={() => setTab('manage')} aria-pressed={tab === 'manage'} className={tabClass(tab === 'manage')}>
              账号与配置
            </button>
            <button type="button" onClick={() => setTab('logs')} aria-pressed={tab === 'logs'} className={tabClass(tab === 'logs')}>
              请求日志
            </button>
          </div>
        </div>

        {tab === 'manage' ? (
          <div className="mt-3 flex flex-col gap-3 sm:mt-4 sm:gap-4">
            <ConfigSection />
            <CookieSection />
            <AccountsSection />
          </div>
        ) : (
          <div className={`${surface} ${surfaceContent}`}>
            <h2 className="mb-3 text-sm font-medium text-ink sm:text-[15px]">最近请求</h2>
            <RequestLogsTable logs={logs ?? []} />
          </div>
        )}
      </main>
    </>
  );
}
