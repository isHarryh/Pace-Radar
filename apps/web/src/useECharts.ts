import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export function useECharts<T extends echarts.EChartsOption>(option: T) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    echarts.getInstanceByDom(el)?.setOption(option);
  }, [option]);
  return ref;
}