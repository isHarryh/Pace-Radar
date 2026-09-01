import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAdminConfig, updateAdminConfig } from '../../api';

import { btnPrimary, errorMessage, fieldLabel, inputBase, surface, surfaceBody, surfaceFooter, surfaceHeader } from '../ui';
const inputCls = `${inputBase} w-24`;

export function ConfigSection() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-config'], queryFn: fetchAdminConfig, refetchInterval: 30_000 });
  const [collect, setCollect] = useState('');
  const [active, setActive] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (data) {
      setCollect(String(data.collectIntervalMinutes));
      setActive(String(data.activeIntervalMinutes));
    }
  }, [data]);

  const save = async () => {
    const collectOk = Number.isInteger(Number(collect)) && Number(collect) >= 1;
    const activeOk = Number.isInteger(Number(active)) && Number(active) >= 1;
    if (!collectOk || !activeOk) {
      setError('间隔需为不小于 1 的整数（分钟）');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateAdminConfig({ collectIntervalMinutes: Number(collect), activeIntervalMinutes: Number(active) });
      void queryClient.invalidateQueries({ queryKey: ['admin-config'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const isDirty = data ? collect !== String(data.collectIntervalMinutes) || active !== String(data.activeIntervalMinutes) : false;
  const canSave = isDirty && !busy;

  return (
    <section className={surface}>
      <div className={surfaceHeader}>
        <h2 className="text-sm font-semibold text-ink">采集间隔</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">正常状态按常规频率，观察 / 节奏中自动加速。</p>
      </div>
      <div className={surfaceBody}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={fieldLabel}>
            <span>正常状态 <span className="font-normal text-muted">/ 分钟</span></span>
            <input value={collect} onChange={(e) => setCollect(e.target.value)} className={inputCls} inputMode="numeric" placeholder="5" />
          </label>
          <label className={fieldLabel}>
            <span>观察 / 节奏状态 <span className="font-normal text-muted">/ 分钟</span></span>
            <input value={active} onChange={(e) => setActive(e.target.value)} className={inputCls} inputMode="numeric" placeholder="1" />
          </label>
        </div>
        {error && <p className={`${errorMessage} mt-3`}>{error}</p>}
      </div>
      <div className={surfaceFooter}>
        <p className="text-xs text-muted">默认 5 分钟 / 1 分钟，需为 ≥1 的整数</p>
        <button type="button" disabled={!canSave} onClick={save} className={btnPrimary}>
          {busy ? '保存中…' : '保存设置'}
        </button>
      </div>
    </section>
  );
}
