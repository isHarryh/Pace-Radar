import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdminAccount,
  fetchAdminAccounts,
  updateAdminAccount,
  type AdminAccount,
} from '../../api';
import { AvatarUpload } from '../AvatarUpload';

import { btnPrimarySm, inputBase } from './ui';
const toggleCls = 'sr-only';

function AccountRow({ account, onSaved }: { account: AdminAccount; onSaved: () => void }) {
  const [name, setName] = useState(account.name);
  const [threshold, setThreshold] = useState(String(account.threshold));
  const [enabled, setEnabled] = useState(account.enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const thresholdOk = Number.isFinite(Number(threshold)) && Number(threshold) > 0;
  const dirty = name.trim() !== account.name || threshold !== String(account.threshold) || enabled !== account.enabled;
  const canSave = dirty && thresholdOk && name.trim().length > 0 && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError('');
    try {
      await updateAdminAccount(account.mid, { name: name.trim(), threshold: Number(threshold), enabled });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-line/60 last:border-0 hover:bg-bg/40">
      <td className="py-2.5 pr-3">
        <AvatarUpload accountId={account.mid} name={account.name} hasAvatar={account.hasAvatar} onSaved={onSaved} />
      </td>
      <td className="py-2.5 pr-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="显示名称" className={`${inputBase} min-w-[140px]`} />
      </td>
      <td className="py-2.5 pr-3">
        <span className="font-mono text-xs text-muted">{account.mid}</span>
      </td>
      <td className="py-2.5 pr-3">
        <input
          type="number"
          step="0.05"
          min="0.01"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className={`${inputBase} h-8 w-20`}
          inputMode="decimal"
        />
      </td>
      <td className="py-2.5 pr-3">
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className={toggleCls} />
          <span
            className={`h-5 w-9 rounded-full transition ${enabled ? 'bg-brand' : 'bg-line'} after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition ${enabled ? 'after:translate-x-4' : ''}`}
          />
        </label>
      </td>
      <td className="py-2.5">
        <div className="flex items-center gap-2">
          <button type="button" disabled={!canSave} onClick={save} className={btnPrimarySm}>
            {busy ? '保存中' : '保存'}
          </button>
          {error && <span className="max-w-[14ch] truncate text-xs text-danger" title={error}>{error}</span>}
        </div>
      </td>
    </tr>
  );
}

export function AccountsSection() {
  const queryClient = useQueryClient();
  const { data: accounts } = useQuery({
    queryKey: ['admin-accounts'],
    queryFn: fetchAdminAccounts,
    refetchInterval: 30_000,
  });
  const [newMid, setNewMid] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin-accounts'] });

  const create = async () => {
    const mid = Number(newMid);
    if (!Number.isInteger(mid) || mid <= 0 || !newName.trim()) {
      setError('mid 需为正整数，名称不能为空');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createAdminAccount({ mid, name: newName.trim() });
      setNewMid('');
      setNewName('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const canCreate = newMid.trim().length > 0 && newName.trim().length > 0 && !busy;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="border-b border-line/60 bg-bg/40 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">监控账号</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">管理 B 站 UID 与评赞比阈值，启用后即进入采集队列。</p>
      </div>
      <div className="-mx-0 overflow-x-auto overscroll-x-contain [&::-webkit-scrollbar]:hidden">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line bg-bg/30 text-left text-xs text-muted">
              <th className="px-4 py-2.5 font-medium">头像</th>
              <th className="px-3 py-2.5 font-medium">名称</th>
              <th className="px-3 py-2.5 font-medium">UID</th>
              <th className="px-3 py-2.5 font-medium">阈值</th>
              <th className="px-3 py-2.5 font-medium">启用</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {accounts?.map((account) => (
              <AccountRow key={account.mid} account={account} onSaved={refresh} />
            ))}
          </tbody>
        </table>
        {!accounts?.length && <p className="py-10 text-center text-sm text-muted">暂无账号，请在下方新增</p>}
      </div>
      <div className="border-t border-line/60 bg-bg/30 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_180px_1fr] sm:items-end">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
            <span>UID <span className="font-normal text-muted">· 数字</span></span>
            <input placeholder="如 2" value={newMid} onChange={(e) => setNewMid(e.target.value)} className={inputBase} inputMode="numeric" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
            <span>显示名称</span>
            <input placeholder="如 哔哩哔哩官方" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputBase} />
          </label>
          <div className="flex items-center gap-2 sm:justify-end">
            <button
              type="button"
              disabled={!canCreate}
              onClick={create}
              className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-brand px-5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-hover active:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {busy ? '创建中…' : '新增账号'}
            </button>
          </div>
        </div>
        {error && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <p className="mt-2 hidden text-xs text-muted sm:block">提示：UID 为 space.bilibili.com/ 后的数字，阈值默认 0.5。</p>
      </div>
    </section>
  );
}